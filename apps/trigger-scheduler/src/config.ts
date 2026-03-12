import crypto from 'node:crypto';

import { loadInternalAuthConfigFromEnv } from '@baseinterface/shared';

export const PORT = Number(process.env.PORT || 8793);
export const INTERNAL_AUTH_DEFAULT_SERVICE_ID = 'trigger-scheduler';
export const INTERNAL_AUTH_CONFIG = (() => {
  const config = loadInternalAuthConfigFromEnv(process.env);
  if (config.serviceId === 'unknown') {
    config.serviceId = INTERNAL_AUTH_DEFAULT_SERVICE_ID;
  }
  return config;
})();
export const WORKFLOW_PLATFORM_BASE_URL = (process.env.UNIASSIST_WORKFLOW_PLATFORM_BASE_URL || 'http://127.0.0.1:8791').replace(/\/$/, '');
export const WORKFLOW_PLATFORM_SERVICE_ID = process.env.UNIASSIST_WORKFLOW_PLATFORM_SERVICE_ID || 'workflow-platform-api';
export const SCHEDULE_POLL_INTERVAL_MS = Number(process.env.UNIASSIST_TRIGGER_SCHEDULER_POLL_INTERVAL_MS || 5000);

export function now(): number {
  return Date.now();
}

export function uuid(): string {
  return crypto.randomUUID();
}
