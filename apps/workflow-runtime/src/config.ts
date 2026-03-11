import crypto from 'node:crypto';

import { loadInternalAuthConfigFromEnv } from '@baseinterface/shared';
import { parseExecutorRegistryFromEnv } from '@baseinterface/executor-sdk';

export const PORT = Number(process.env.PORT || 8792);
export const INTERNAL_AUTH_DEFAULT_SERVICE_ID = 'workflow-runtime';
export const INTERNAL_AUTH_CONFIG = (() => {
  const config = loadInternalAuthConfigFromEnv(process.env);
  if (config.serviceId === 'unknown') {
    config.serviceId = INTERNAL_AUTH_DEFAULT_SERVICE_ID;
  }
  return config;
})();
export const EXECUTOR_REGISTRY = parseExecutorRegistryFromEnv(process.env);
export const DATABASE_URL = process.env.DATABASE_URL || '';

export function now(): number {
  return Date.now();
}

export function uuid(): string {
  return crypto.randomUUID();
}
