import crypto from 'node:crypto';

import { getEnabledConnectorRegistryKeys, parseConnectorRegistryFromEnv } from '@uniassist/connector-sdk';
import { loadInternalAuthConfigFromEnv } from '@uniassist/shared';

export const PORT = Number(process.env.PORT || 8791);
export const INTERNAL_AUTH_DEFAULT_SERVICE_ID = 'workflow-platform-api';
export const INTERNAL_AUTH_CONFIG = (() => {
  const config = loadInternalAuthConfigFromEnv(process.env);
  if (config.serviceId === 'unknown') {
    config.serviceId = INTERNAL_AUTH_DEFAULT_SERVICE_ID;
  }
  return config;
})();
export const WORKFLOW_RUNTIME_BASE_URL = (process.env.UNIASSIST_WORKFLOW_RUNTIME_BASE_URL || 'http://127.0.0.1:8792').replace(/\/$/, '');
export const WORKFLOW_RUNTIME_PUBLIC_BASE_URL = (process.env.UNIASSIST_WORKFLOW_RUNTIME_PUBLIC_BASE_URL || WORKFLOW_RUNTIME_BASE_URL).replace(/\/$/, '');
export const WORKFLOW_RUNTIME_SERVICE_ID = process.env.UNIASSIST_WORKFLOW_RUNTIME_SERVICE_ID || 'workflow-runtime';
export const CONNECTOR_RUNTIME_SERVICE_ID = process.env.UNIASSIST_CONNECTOR_RUNTIME_SERVICE_ID || 'connector-runtime';
export const TRIGGER_SCHEDULER_SERVICE_ID = process.env.UNIASSIST_TRIGGER_SCHEDULER_SERVICE_ID || 'trigger-scheduler';
export const DATABASE_URL = process.env.DATABASE_URL || '';
export const UNIASSIST_ENABLE_CONVEX_RUNBOARD_EXPERIMENT = process.env.UNIASSIST_ENABLE_CONVEX_RUNBOARD_EXPERIMENT === 'true';
export const UNIASSIST_CONVEX_URL = (process.env.UNIASSIST_CONVEX_URL || '').replace(/\/$/, '');
export const CONNECTOR_REGISTRY = parseConnectorRegistryFromEnv(process.env);
export const ENABLED_CONNECTOR_KEYS = getEnabledConnectorRegistryKeys(CONNECTOR_REGISTRY);

export function now(): number {
  return Date.now();
}

export function uuid(): string {
  return crypto.randomUUID();
}
