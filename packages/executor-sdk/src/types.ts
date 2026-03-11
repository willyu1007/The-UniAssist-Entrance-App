import type { ContextPackage, InteractionEvent, UserInteraction, UnifiedUserInput } from '@baseinterface/contracts';

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

export function parseExecutorRegistryFromEnv(env: NodeJS.ProcessEnv): ExecutorRegistryEntry[] {
  const defaults: ExecutorRegistryEntry[] = [
    {
      executorId: 'compat-plan',
      kind: 'compat-provider',
      providerId: 'plan',
      serviceId: 'provider-plan',
      baseUrl: (env.UNIASSIST_PLAN_PROVIDER_BASE_URL || '').replace(/\/$/, '') || undefined,
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
