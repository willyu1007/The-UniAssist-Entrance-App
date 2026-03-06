import crypto from 'node:crypto';

import { loadInternalAuthConfigFromEnv } from '@baseinterface/shared';
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
      providerId: 'plan',
      serviceId: 'provider-plan',
      baseUrl: (process.env.UNIASSIST_PLAN_PROVIDER_BASE_URL || '').replace(/\/$/, '') || undefined,
      keywords: ['计划', '安排', '日程', '目标', '规划'],
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
