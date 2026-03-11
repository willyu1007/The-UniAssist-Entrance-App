import { buildInternalAuthHeaders, type InternalAuthConfig } from '@baseinterface/shared';
import type {
  ProviderInteractRequest,
  ProviderInteractResponse,
  ProviderInvokeRequest,
  ProviderInvokeResponse,
} from '@baseinterface/contracts';
import type {
  CompatExecutorClient,
  CompatExecutorInvokeInput,
  CompatExecutorResumeInput,
  ExecutorRegistryEntry,
} from './types';

type CreateCompatExecutorClientDeps = {
  internalAuthConfig: InternalAuthConfig;
  executorRegistry: ExecutorRegistryEntry[];
  timeoutMs?: number;
};

function normalizeBaseUrl(baseUrl: string | undefined): string | undefined {
  return baseUrl ? baseUrl.replace(/\/$/, '') : undefined;
}

export function createCompatExecutorClient(
  deps: CreateCompatExecutorClientDeps,
): CompatExecutorClient {
  const executorRegistry = new Map(
    deps.executorRegistry.map((entry) => [entry.executorId, { ...entry, baseUrl: normalizeBaseUrl(entry.baseUrl) }]),
  );

  const timeoutMs = deps.timeoutMs ?? 5000;

  const callEndpoint = async <TResponse>(
    entry: ExecutorRegistryEntry,
    path: '/v0/invoke' | '/v0/interact',
    scopes: string[],
    body: ProviderInvokeRequest | ProviderInteractRequest,
  ): Promise<TResponse> => {
    if (!entry.baseUrl) {
      throw new Error(`executor ${entry.executorId} baseUrl is not configured`);
    }

    const rawBody = JSON.stringify(body);
    const headers = buildInternalAuthHeaders(deps.internalAuthConfig, {
      method: 'POST',
      path,
      rawBody,
      audience: entry.serviceId,
      scopes,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${entry.baseUrl}${path}`, {
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
        throw new Error(`executor ${entry.executorId} responded ${response.status}`);
      }
      return await response.json() as TResponse;
    } finally {
      clearTimeout(timer);
    }
  };

  const invoke = async (input: CompatExecutorInvokeInput) => {
    const response = await callEndpoint<ProviderInvokeResponse>(
      input.executor,
      '/v0/invoke',
      ['provider:invoke'],
      {
        schemaVersion: 'v0',
        input: input.input,
        context: input.context,
        run: {
          runId: input.runId,
          providerId: input.executor.providerId,
          attempt: 1,
          idempotencyKey: `${input.input.traceId}:${input.runId}:invoke`,
        },
      },
    );
    return [response.ack, ...(response.immediateEvents || [])];
  };

  const interact = async (input: CompatExecutorResumeInput) => {
    const response = await callEndpoint<ProviderInteractResponse>(
      input.executor,
      '/v0/interact',
      ['provider:interact'],
      {
        schemaVersion: 'v0',
        interaction: input.interaction,
        context: input.context,
        run: {
          runId: input.interaction.runId,
          attempt: 1,
          idempotencyKey: `${input.interaction.traceId}:${input.interaction.runId}:interact`,
        },
      },
    );
    return response.events || [];
  };

  return {
    invoke,
    interact,
    getExecutorEntry: (executorId: string) => executorRegistry.get(executorId),
  };
}
