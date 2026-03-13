import crypto from 'node:crypto';

import { loadInternalAuthConfigFromEnv } from '@baseinterface/shared';
import type { WorkflowEntryRegistryEntry } from '@baseinterface/workflow-contracts';
import type { ProviderRegistryEntry } from './gateway-types';

export const PORT = Number(process.env.PORT || 8787);
export const ADAPTER_SECRET = process.env.UNIASSIST_ADAPTER_SECRET || 'dev-adapter-secret';
export const FALLBACK_PROVIDER_ID = 'builtin_chat';
export const ROUTE_THRESHOLD = 0.55;
export const STICKY_DEFAULT_BOOST = 0.15;
export const STICKY_DECAY_PER_TURN = 0.03;
export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
export const TOPIC_DRIFT_THRESHOLD = 0.3;
export const INTERNAL_AUTH_DEFAULT_SERVICE_ID = 'gateway';

export const PROVIDER_TIMEOUT_MS = 5000;
export const PROVIDER_MAX_ATTEMPTS = 3;
export const PROVIDER_RETRY_DELAYS_MS = [300, 900];
export const PROVIDER_CIRCUIT_OPEN_AFTER_FAILURES = 5;
export const PROVIDER_CIRCUIT_OPEN_MS = 30 * 1000;
export const PROVIDER_CIRCUIT_WINDOW_MS = 60 * 1000;
export const WORKFLOW_ENTRY_ENABLED = process.env.UNIASSIST_WORKFLOW_ENTRY_ENABLED === 'true';
export const WORKFLOW_PLATFORM_API_BASE_URL =
  (process.env.UNIASSIST_WORKFLOW_PLATFORM_API_BASE_URL || 'http://127.0.0.1:8791').replace(/\/$/, '');

export const INTERNAL_AUTH_CONFIG = (() => {
  const config = loadInternalAuthConfigFromEnv(process.env);
  if (config.serviceId === 'unknown') {
    config.serviceId = INTERNAL_AUTH_DEFAULT_SERVICE_ID;
  }
  return config;
})();

export function now(): number {
  return Date.now();
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function parseProviderRegistryFromEnv(): ProviderRegistryEntry[] {
  const defaults: ProviderRegistryEntry[] = [
    {
      providerId: 'sample',
      serviceId: 'provider-sample',
      baseUrl: (process.env.UNIASSIST_SAMPLE_PROVIDER_BASE_URL || '').replace(/\/$/, '') || undefined,
      keywords: ['示例', '样例', '流程', '草稿', '审批', '验证'],
      enabled: true,
    },
    {
      providerId: 'work',
      serviceId: 'provider-work',
      baseUrl: (process.env.UNIASSIST_WORK_PROVIDER_BASE_URL || '').replace(/\/$/, '') || undefined,
      keywords: ['工作', '任务', '项目', '会议', '汇报', '交付'],
      enabled: true,
    },
    {
      providerId: 'reminder',
      serviceId: 'provider-reminder',
      baseUrl: (process.env.UNIASSIST_REMINDER_PROVIDER_BASE_URL || '').replace(/\/$/, '') || undefined,
      keywords: ['提醒', '记录', '待办', '通知'],
      enabled: true,
    },
  ];

  const raw = process.env.UNIASSIST_PROVIDER_REGISTRY_JSON?.trim();
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw) as Array<{
      providerId?: string;
      serviceId?: string;
      baseUrl?: string;
      keywords?: string[];
      enabled?: boolean;
    }>;
    const normalized = parsed
      .filter((item) => Boolean(item?.providerId))
      .map((item) => ({
        providerId: String(item.providerId),
        serviceId: String(item.serviceId || `provider-${item.providerId}`),
        baseUrl: item.baseUrl ? String(item.baseUrl).replace(/\/$/, '') : undefined,
        keywords: Array.isArray(item.keywords) ? item.keywords.map((v) => String(v)) : [],
        enabled: item.enabled !== false,
      }));
    return normalized.length > 0 ? normalized : defaults;
  } catch {
    return defaults;
  }
}

export function parseWorkflowEntryRegistryFromEnv(): WorkflowEntryRegistryEntry[] {
  const raw = process.env.UNIASSIST_WORKFLOW_ENTRY_REGISTRY_JSON?.trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    return parsed
      .filter((item) => typeof item.compatProviderId === 'string' && typeof item.workflowKey === 'string')
      .map((item) => ({
        compatProviderId: String(item.compatProviderId),
        workflowKey: String(item.workflowKey),
        matchKeywords: Array.isArray(item.matchKeywords)
          ? item.matchKeywords.map((value) => String(value))
          : [],
        enabled: item.enabled !== false,
        defaultExecutorId: typeof item.defaultExecutorId === 'string' ? item.defaultExecutorId : 'compat-sample',
        defaultTemplateVersionRef:
          typeof item.defaultTemplateVersionRef === 'string' ? item.defaultTemplateVersionRef : undefined,
      }));
  } catch {
    return [];
  }
}
