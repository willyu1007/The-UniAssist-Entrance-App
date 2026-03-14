import { buildInternalAuthHeaders, type InternalAuthConfig } from '@uniassist/shared';
import type { ConnectorRuntimeInvokeRequest, ConnectorRuntimeInvokeResponse } from '@uniassist/workflow-contracts';
import type { ConnectorRuntimeClient } from './types';

type CreateConnectorRuntimeClientDeps = {
  baseUrl: string;
  internalAuthConfig: InternalAuthConfig;
  connectorRuntimeServiceId: string;
  timeoutMs?: number;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

export function createConnectorRuntimeClient(
  deps: CreateConnectorRuntimeClientDeps,
): ConnectorRuntimeClient {
  const baseUrl = normalizeBaseUrl(deps.baseUrl);
  const timeoutMs = deps.timeoutMs ?? 5000;

  return {
    invoke: async (body: ConnectorRuntimeInvokeRequest): Promise<ConnectorRuntimeInvokeResponse> => {
      const path = '/internal/connectors/actions/invoke';
      const rawBody = JSON.stringify(body);
      const headers = buildInternalAuthHeaders(deps.internalAuthConfig, {
        method: 'POST',
        path,
        rawBody,
        audience: deps.connectorRuntimeServiceId,
        scopes: ['connector:invoke'],
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: headers.authorization,
            'x-uniassist-internal-kid': headers['x-uniassist-internal-kid'],
            'x-uniassist-internal-ts': headers['x-uniassist-internal-ts'],
            'x-uniassist-internal-nonce': headers['x-uniassist-internal-nonce'],
            'x-uniassist-internal-signature': headers['x-uniassist-internal-signature'],
          },
          body: rawBody,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`connector runtime responded ${response.status}`);
        }
        return await response.json() as ConnectorRuntimeInvokeResponse;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
