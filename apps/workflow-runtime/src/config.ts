import crypto from 'node:crypto';

import { loadInternalAuthConfigFromEnv } from '@uniassist/shared';

export const PORT = Number(process.env.PORT || 8792);
export const INTERNAL_AUTH_DEFAULT_SERVICE_ID = 'workflow-runtime';
export const INTERNAL_AUTH_CONFIG = (() => {
  const config = loadInternalAuthConfigFromEnv(process.env);
  if (config.serviceId === 'unknown') {
    config.serviceId = INTERNAL_AUTH_DEFAULT_SERVICE_ID;
  }
  return config;
})();
export const EXTERNAL_BRIDGE_ALLOWED_SUBJECTS = (process.env.UNIASSIST_EXTERNAL_BRIDGE_ALLOWED_SUBJECTS || 'executor-bridge-sample')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
export const CONNECTOR_RUNTIME_BASE_URL = (process.env.UNIASSIST_CONNECTOR_RUNTIME_BASE_URL || 'http://127.0.0.1:8895').replace(/\/$/, '');
export const CONNECTOR_RUNTIME_SERVICE_ID = process.env.UNIASSIST_CONNECTOR_RUNTIME_SERVICE_ID || 'connector-runtime';
export const CONNECTOR_RUNTIME_ALLOWED_SUBJECTS = (process.env.UNIASSIST_CONNECTOR_RUNTIME_ALLOWED_SUBJECTS || 'connector-runtime')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
export const DATABASE_URL = process.env.DATABASE_URL || '';

export function now(): number {
  return Date.now();
}

export function uuid(): string {
  return crypto.randomUUID();
}
