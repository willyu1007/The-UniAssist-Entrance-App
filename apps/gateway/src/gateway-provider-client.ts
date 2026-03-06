import {
  buildInternalAuthHeaders,
  type InternalAuthConfig,
} from '@baseinterface/shared';
import type {
  ContextPackage,
  InteractionEvent,
  ProviderInteractRequest,
  ProviderInteractResponse,
  ProviderInvokeRequest,
  ProviderInvokeResponse,
  ProviderManifest,
  UserInteraction,
  UnifiedUserInput,
} from '@baseinterface/contracts';

import {
  PROVIDER_CIRCUIT_OPEN_AFTER_FAILURES,
  PROVIDER_CIRCUIT_OPEN_MS,
  PROVIDER_CIRCUIT_WINDOW_MS,
  PROVIDER_MAX_ATTEMPTS,
  PROVIDER_RETRY_DELAYS_MS,
  PROVIDER_TIMEOUT_MS,
} from './gateway-config';
import type { ProviderRegistryEntry } from './gateway-types';

type LoggerLike = {
  warn: (msg: string, fields?: Record<string, unknown>) => void;
};

type ProviderCallEndpoint = 'invoke' | 'interact';

type ProviderCallErrorCode =
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_REJECTED'
  | 'PROVIDER_AUTH_DENIED'
  | 'PROVIDER_INVALID_RESPONSE';

type ProviderCallError = {
  code: ProviderCallErrorCode;
  retryable: boolean;
  statusCode?: number;
  message: string;
};

type ProviderCircuitState = {
  openedAt?: number;
  failureWindowStartedAt?: number;
  failureCount: number;
  halfOpen: boolean;
};

type ProviderClientDeps = {
  providerRegistry: Map<string, ProviderRegistryEntry>;
  internalAuthConfig: InternalAuthConfig;
  now: () => number;
  observability: {
    observeProviderInvokeError: () => void;
    observeProviderInteractError: () => void;
  };
  logger: LoggerLike;
  normalizeProviderInteractionEvent: (providerId: string, runId: string, event: InteractionEvent) => InteractionEvent;
};

export type ProviderClient = {
  refreshAllProviderManifests: () => Promise<void>;
  providerAllowedSubjects: () => string[];
  getProviderEntry: (providerId: string) => ProviderRegistryEntry | undefined;
  invokeProvider: (
    provider: ProviderRegistryEntry,
    input: UnifiedUserInput,
    context: ContextPackage,
    runId: string,
  ) => Promise<InteractionEvent[]>;
  interactProvider: (
    provider: ProviderRegistryEntry,
    interaction: UserInteraction,
    context: ContextPackage,
  ) => Promise<InteractionEvent[]>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapProviderStatusError(statusCode: number): ProviderCallError {
  if (statusCode === 401 || statusCode === 403) {
    return {
      code: 'PROVIDER_AUTH_DENIED',
      retryable: false,
      statusCode,
      message: `provider auth denied: ${statusCode}`,
    };
  }
  if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
    return {
      code: 'PROVIDER_REJECTED',
      retryable: false,
      statusCode,
      message: `provider rejected request: ${statusCode}`,
    };
  }
  return {
    code: 'PROVIDER_UNAVAILABLE',
    retryable: true,
    statusCode,
    message: `provider unavailable: ${statusCode}`,
  };
}

export function createProviderClient(deps: ProviderClientDeps): ProviderClient {
  const providerCircuit = new Map<string, ProviderCircuitState>();

  const refreshProviderManifest = async (provider: ProviderRegistryEntry): Promise<void> => {
    if (!provider.baseUrl) return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${provider.baseUrl}/.well-known/uniassist/manifest.json`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) return;
      const manifest = (await response.json()) as ProviderManifest;
      provider.manifest = manifest;
    } catch {
      // best effort; keep static registry when manifest unavailable
    }
  };

  const refreshAllProviderManifests = async (): Promise<void> => {
    for (const provider of deps.providerRegistry.values()) {
      if (!provider.enabled) continue;
      await refreshProviderManifest(provider);
    }
  };

  const circuitKey = (providerId: string, endpoint: ProviderCallEndpoint): string => {
    return `${providerId}:${endpoint}`;
  };

  const canCallProvider = (providerId: string, endpoint: ProviderCallEndpoint): boolean => {
    const key = circuitKey(providerId, endpoint);
    const state = providerCircuit.get(key);
    if (!state || !state.openedAt) return true;
    if (deps.now() - state.openedAt >= PROVIDER_CIRCUIT_OPEN_MS) {
      state.openedAt = undefined;
      state.halfOpen = true;
      providerCircuit.set(key, state);
      return true;
    }
    return false;
  };

  const markProviderCallSuccess = (providerId: string, endpoint: ProviderCallEndpoint): void => {
    providerCircuit.set(circuitKey(providerId, endpoint), {
      failureCount: 0,
      failureWindowStartedAt: undefined,
      halfOpen: false,
      openedAt: undefined,
    });
  };

  const markProviderCallFailure = (providerId: string, endpoint: ProviderCallEndpoint): void => {
    const key = circuitKey(providerId, endpoint);
    const state = providerCircuit.get(key) || {
      failureCount: 0,
      halfOpen: false,
    };
    const current = deps.now();
    if (!state.failureWindowStartedAt || current - state.failureWindowStartedAt > PROVIDER_CIRCUIT_WINDOW_MS) {
      state.failureWindowStartedAt = current;
      state.failureCount = 1;
    } else {
      state.failureCount += 1;
    }
    if (state.failureCount >= PROVIDER_CIRCUIT_OPEN_AFTER_FAILURES) {
      state.openedAt = current;
      state.halfOpen = false;
    }
    providerCircuit.set(key, state);
  };

  const callProviderEndpoint = async <TResponse>(
    provider: ProviderRegistryEntry,
    endpoint: ProviderCallEndpoint,
    requestBody: ProviderInvokeRequest | ProviderInteractRequest,
  ): Promise<TResponse> => {
    if (!provider.baseUrl) {
      throw {
        code: 'PROVIDER_UNAVAILABLE',
        retryable: false,
        message: `${provider.providerId} baseUrl is not configured`,
      } satisfies ProviderCallError;
    }

    if (!canCallProvider(provider.providerId, endpoint)) {
      throw {
        code: 'PROVIDER_UNAVAILABLE',
        retryable: true,
        message: `${provider.providerId}:${endpoint} circuit is open`,
      } satisfies ProviderCallError;
    }

    const path = endpoint === 'invoke' ? '/v0/invoke' : '/v0/interact';
    const scopes = endpoint === 'invoke' ? ['provider:invoke'] : ['provider:interact'];

    let lastError: ProviderCallError | undefined;
    for (let attempt = 1; attempt <= PROVIDER_MAX_ATTEMPTS; attempt += 1) {
      const rawBody = JSON.stringify({
        ...requestBody,
        run: {
          ...requestBody.run,
          attempt,
        },
      });

      const internalHeaders = buildInternalAuthHeaders(deps.internalAuthConfig, {
        method: 'POST',
        path,
        rawBody,
        audience: provider.serviceId,
        scopes,
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

      try {
        const response = await fetch(`${provider.baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: internalHeaders.authorization,
            'x-uniassist-internal-kid': internalHeaders['x-uniassist-internal-kid'],
            'x-uniassist-internal-ts': internalHeaders['x-uniassist-internal-ts'],
            'x-uniassist-internal-nonce': internalHeaders['x-uniassist-internal-nonce'],
            'x-uniassist-internal-signature': internalHeaders['x-uniassist-internal-signature'],
          },
          body: rawBody,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          const mapped = mapProviderStatusError(response.status);
          lastError = mapped;
          if (!mapped.retryable) {
            markProviderCallFailure(provider.providerId, endpoint);
            throw mapped;
          }
          if (attempt < PROVIDER_MAX_ATTEMPTS) {
            const delay = (PROVIDER_RETRY_DELAYS_MS[attempt - 1] || 1200) + Math.floor(Math.random() * 100);
            await sleep(delay);
            continue;
          }
          markProviderCallFailure(provider.providerId, endpoint);
          throw mapped;
        }

        const payload = await response.json() as TResponse;
        markProviderCallSuccess(provider.providerId, endpoint);
        return payload;
      } catch (error) {
        clearTimeout(timeout);
        if ((error as { code?: string }).code) {
          throw error;
        }
        const mapped: ProviderCallError = (error as { name?: string }).name === 'AbortError'
          ? {
              code: 'PROVIDER_TIMEOUT',
              retryable: true,
              message: `${provider.providerId}:${endpoint} timeout`,
            }
          : {
              code: 'PROVIDER_UNAVAILABLE',
              retryable: true,
              message: `${provider.providerId}:${endpoint} network error`,
            };
        lastError = mapped;
        if (attempt < PROVIDER_MAX_ATTEMPTS && mapped.retryable) {
          const delay = (PROVIDER_RETRY_DELAYS_MS[attempt - 1] || 1200) + Math.floor(Math.random() * 100);
          await sleep(delay);
          continue;
        }
        markProviderCallFailure(provider.providerId, endpoint);
        throw mapped;
      }
    }

    throw lastError || {
      code: 'PROVIDER_UNAVAILABLE',
      retryable: true,
      message: `${provider.providerId}:${endpoint} failed`,
    };
  };

  const invokeProvider = async (
    provider: ProviderRegistryEntry,
    input: UnifiedUserInput,
    context: ContextPackage,
    runId: string,
  ): Promise<InteractionEvent[]> => {
    const requestBody: ProviderInvokeRequest = {
      schemaVersion: 'v0',
      input,
      context,
      run: {
        runId,
        providerId: provider.providerId,
        attempt: 1,
        idempotencyKey: `${input.traceId}:${provider.providerId}`,
      },
    };

    try {
      const payload = await callProviderEndpoint<ProviderInvokeResponse>(provider, 'invoke', requestBody);
      const events: InteractionEvent[] = [payload.ack, ...(payload.immediateEvents || [])];
      return events.map((event) => deps.normalizeProviderInteractionEvent(provider.providerId, runId, event));
    } catch (error) {
      deps.observability.observeProviderInvokeError();
      deps.logger.warn('provider invoke fallback', {
        providerId: provider.providerId,
        ...(error && typeof error === 'object' ? error : { message: String(error) }),
      });
      return [
        {
          type: 'error',
          userMessage: `${provider.providerId} 专项暂时不可用，已切换为入口兜底处理。`,
          retryable: true,
        },
      ];
    }
  };

  const interactProvider = async (
    provider: ProviderRegistryEntry,
    interaction: UserInteraction,
    context: ContextPackage,
  ): Promise<InteractionEvent[]> => {
    const requestBody: ProviderInteractRequest = {
      schemaVersion: 'v0',
      interaction,
      context,
      run: {
        runId: interaction.runId,
        attempt: 1,
        idempotencyKey: `${interaction.traceId}:${interaction.runId}:interact`,
      },
    };

    try {
      const payload = await callProviderEndpoint<ProviderInteractResponse>(provider, 'interact', requestBody);
      return (payload.events || []).map((event) => deps.normalizeProviderInteractionEvent(provider.providerId, interaction.runId, event));
    } catch (error) {
      deps.observability.observeProviderInteractError();
      deps.logger.warn('provider interact fallback', {
        providerId: provider.providerId,
        ...(error && typeof error === 'object' ? error : { message: String(error) }),
      });
      const fallbackEvents: InteractionEvent[] = [
        {
          type: 'error',
          userMessage: `${provider.providerId} 专项交互失败，入口将使用本地流程继续。`,
          retryable: true,
        },
      ];

      if (interaction.inReplyTo?.taskId) {
        fallbackEvents.push({
          type: 'provider_extension',
          extensionKind: 'task_state',
          payload: {
            schemaVersion: 'v0',
            providerId: provider.providerId,
            runId: interaction.runId,
            taskId: interaction.inReplyTo.taskId,
            state: 'failed',
            executionPolicy: 'require_user_confirm',
            metadata: {
              reason: 'provider_interact_failed',
            },
          },
        });
      }
      return fallbackEvents;
    }
  };

  return {
    refreshAllProviderManifests,
    providerAllowedSubjects: () => {
      const subjects = new Set<string>();
      deps.providerRegistry.forEach((entry) => {
        if (entry.enabled && entry.serviceId && entry.baseUrl) {
          subjects.add(entry.serviceId);
        }
      });
      return [...subjects];
    },
    getProviderEntry: (providerId: string) => deps.providerRegistry.get(providerId),
    invokeProvider,
    interactProvider,
  };
}
