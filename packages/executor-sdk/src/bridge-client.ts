import { buildInternalAuthHeaders, type InternalAuthConfig } from '@baseinterface/shared';
import type {
  BridgeHealth,
  BridgeManifest,
  BridgeRegistrationRecord,
  ExternalRuntimeBridgeCancelRequest,
  ExternalRuntimeBridgeCancelResponse,
  ExternalRuntimeBridgeInvokeRequest,
  ExternalRuntimeBridgeInvokeResponse,
  ExternalRuntimeBridgeResumeRequest,
  ExternalRuntimeBridgeResumeResponse,
} from '@baseinterface/workflow-contracts';
import { parseBridgeHealth, parseBridgeManifest } from '@baseinterface/workflow-contracts';
import type { ExternalBridgeClient } from './types';

type CreateExternalBridgeClientDeps = {
  internalAuthConfig: InternalAuthConfig;
  timeoutMs?: number;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

type BridgeRef = Pick<BridgeRegistrationRecord, 'bridgeId' | 'baseUrl' | 'serviceId'>;

export function createExternalBridgeClient(
  deps: CreateExternalBridgeClientDeps,
): ExternalBridgeClient {
  const timeoutMs = deps.timeoutMs ?? 5000;

  const request = async <TResponse>(
    bridge: BridgeRef,
    method: 'GET' | 'POST',
    path: '/health' | '/manifest' | '/invoke' | '/resume' | '/cancel',
    scopes: string[],
    body?: unknown,
    parse?: (value: unknown) => TResponse,
  ): Promise<TResponse> => {
    const baseUrl = normalizeBaseUrl(bridge.baseUrl);
    if (!baseUrl) {
      throw new Error(`bridge ${bridge.bridgeId} baseUrl is not configured`);
    }

    const rawBody = body === undefined ? '' : JSON.stringify(body);
    const headers = buildInternalAuthHeaders(deps.internalAuthConfig, {
      method,
      path,
      rawBody,
      audience: bridge.serviceId,
      scopes,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          authorization: headers.authorization,
          'x-uniassist-internal-kid': headers['x-uniassist-internal-kid'],
          'x-uniassist-internal-ts': headers['x-uniassist-internal-ts'],
          'x-uniassist-internal-nonce': headers['x-uniassist-internal-nonce'],
          'x-uniassist-internal-signature': headers['x-uniassist-internal-signature'],
        },
        body: body === undefined ? undefined : rawBody,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`bridge ${bridge.bridgeId} responded ${response.status}`);
      }
      const payload = await response.json() as unknown;
      if (!parse) {
        return payload as TResponse;
      }
      try {
        return parse(payload);
      } catch (error) {
        throw new Error(
          `bridge ${bridge.bridgeId} ${path} response invalid: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    getManifest: async (bridge) => await request<BridgeManifest>(bridge, 'GET', '/manifest', ['bridge:read'], undefined, parseBridgeManifest),
    getHealth: async (bridge) => await request<BridgeHealth>(bridge, 'GET', '/health', ['bridge:read'], undefined, parseBridgeHealth),
    invoke: async (bridge, body) => await request<ExternalRuntimeBridgeInvokeResponse>(bridge, 'POST', '/invoke', ['bridge:invoke'], body),
    resume: async (bridge, body) => await request<ExternalRuntimeBridgeResumeResponse>(bridge, 'POST', '/resume', ['bridge:resume'], body),
    cancel: async (bridge, body) => await request<ExternalRuntimeBridgeCancelResponse>(bridge, 'POST', '/cancel', ['bridge:cancel'], body),
  };
}
