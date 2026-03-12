import type { ContextPackage, InteractionEvent, UserInteraction, UnifiedUserInput } from '@baseinterface/contracts';
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

export type ExecutorKind = 'compat-provider';

export type ExecutorRegistryEntry = {
  executorId: string;
  kind: ExecutorKind;
  providerId: string;
  serviceId: string;
  baseUrl?: string;
  enabled: boolean;
  requiredScopes: string[];
};

export type CompatExecutorInvokeInput = {
  executor: ExecutorRegistryEntry;
  input: UnifiedUserInput;
  context: ContextPackage;
  runId: string;
};

export type CompatExecutorResumeInput = {
  executor: ExecutorRegistryEntry;
  interaction: UserInteraction;
  context: ContextPackage;
};

export type CompatExecutorClient = {
  invoke: (input: CompatExecutorInvokeInput) => Promise<InteractionEvent[]>;
  interact: (input: CompatExecutorResumeInput) => Promise<InteractionEvent[]>;
  getExecutorEntry: (executorId: string) => ExecutorRegistryEntry | undefined;
};

export type ExternalBridgeClient = {
  getManifest: (bridge: Pick<BridgeRegistrationRecord, 'bridgeId' | 'baseUrl' | 'serviceId'>) => Promise<BridgeManifest>;
  getHealth: (bridge: Pick<BridgeRegistrationRecord, 'bridgeId' | 'baseUrl' | 'serviceId'>) => Promise<BridgeHealth>;
  invoke: (
    bridge: Pick<BridgeRegistrationRecord, 'bridgeId' | 'baseUrl' | 'serviceId'>,
    body: ExternalRuntimeBridgeInvokeRequest,
  ) => Promise<ExternalRuntimeBridgeInvokeResponse>;
  resume: (
    bridge: Pick<BridgeRegistrationRecord, 'bridgeId' | 'baseUrl' | 'serviceId'>,
    body: ExternalRuntimeBridgeResumeRequest,
  ) => Promise<ExternalRuntimeBridgeResumeResponse>;
  cancel: (
    bridge: Pick<BridgeRegistrationRecord, 'bridgeId' | 'baseUrl' | 'serviceId'>,
    body: ExternalRuntimeBridgeCancelRequest,
  ) => Promise<ExternalRuntimeBridgeCancelResponse>;
};

export function parseExecutorRegistryFromEnv(env: NodeJS.ProcessEnv): ExecutorRegistryEntry[] {
  const defaults: ExecutorRegistryEntry[] = [
    {
      executorId: 'compat-sample',
      kind: 'compat-provider',
      providerId: 'sample',
      serviceId: 'provider-sample',
      baseUrl: (env.UNIASSIST_SAMPLE_PROVIDER_BASE_URL || '').replace(/\/$/, '') || undefined,
      enabled: true,
      requiredScopes: ['provider:invoke', 'provider:interact', 'context:read'],
    },
  ];

  const raw = env.UNIASSIST_EXECUTOR_REGISTRY_JSON?.trim();
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    const normalized = parsed
      .filter((item) => typeof item.executorId === 'string' && item.executorId.length > 0)
      .map((item) => ({
        executorId: String(item.executorId),
        kind: 'compat-provider' as const,
        providerId: String(item.providerId || item.executorId),
        serviceId: String(item.serviceId || `provider-${item.providerId || item.executorId}`),
        baseUrl: typeof item.baseUrl === 'string' ? item.baseUrl.replace(/\/$/, '') : undefined,
        enabled: item.enabled !== false,
        requiredScopes: Array.isArray(item.requiredScopes)
          ? item.requiredScopes.map((value) => String(value))
          : ['provider:invoke', 'provider:interact', 'context:read'],
      }));
    return normalized.length > 0 ? normalized : defaults;
  } catch {
    return defaults;
  }
}
