import { parseConnectorRegistryFromEnv } from '@baseinterface/connector-sdk';
import { loadInternalAuthConfigFromEnv } from '@baseinterface/shared';

export const PORT = Number(process.env.PORT || 8895);
export const INTERNAL_AUTH_DEFAULT_SERVICE_ID = 'connector-runtime';
export const INTERNAL_AUTH_CONFIG = (() => {
  const config = loadInternalAuthConfigFromEnv(process.env);
  if (config.serviceId === 'unknown') {
    config.serviceId = INTERNAL_AUTH_DEFAULT_SERVICE_ID;
  }
  return config;
})();
export const WORKFLOW_RUNTIME_BASE_URL = (process.env.UNIASSIST_WORKFLOW_RUNTIME_BASE_URL || 'http://127.0.0.1:8892').replace(/\/$/, '');
export const WORKFLOW_RUNTIME_SERVICE_ID = process.env.UNIASSIST_WORKFLOW_RUNTIME_SERVICE_ID || 'workflow-runtime';
export const WORKFLOW_PLATFORM_BASE_URL = (process.env.UNIASSIST_WORKFLOW_PLATFORM_API_BASE_URL || 'http://127.0.0.1:8891').replace(/\/$/, '');
export const WORKFLOW_PLATFORM_SERVICE_ID = process.env.UNIASSIST_WORKFLOW_PLATFORM_SERVICE_ID || 'workflow-platform-api';
export const CONNECTOR_REGISTRY = parseConnectorRegistryFromEnv(process.env);
export const now = (): number => Date.now();
