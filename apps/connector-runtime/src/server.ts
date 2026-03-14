import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import express from 'express';

import { buildInternalAuthHeaders, createLogger, createMemoryNonceStore, verifyInternalAuthRequest } from '@uniassist/shared';
import { loadConnectorAdapters, type ConnectorAdapter } from '@uniassist/connector-sdk';
import type {
  ConnectorRuntimeInvokeRequest,
  ConnectorRuntimeInvokeResponse,
  EventSubscriptionRuntimeConfigResponse,
  EventSubscriptionDispatchRequest,
  WorkflowRuntimeConnectorActionSessionLookupResponse,
  WorkflowRuntimeConnectorCallbackRequest,
} from '@uniassist/workflow-contracts';
import {
  CONNECTOR_REGISTRY,
  INTERNAL_AUTH_CONFIG,
  PORT,
  WORKFLOW_PLATFORM_BASE_URL,
  WORKFLOW_PLATFORM_SERVICE_ID,
  WORKFLOW_RUNTIME_BASE_URL,
  WORKFLOW_RUNTIME_SERVICE_ID,
  now,
} from './config';

type RawBodyRequest = Request & { rawBody?: string };

class InternalRequestError extends Error {
  readonly status: number;

  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'InternalRequestError';
    this.status = status;
    this.code = code;
  }
}

type ActionSession = {
  connectorActionSessionId: string;
  connectorKey: string;
  action: ConnectorRuntimeInvokeRequest['action'];
  runId: string;
  nodeRunId: string;
  publicCallbackKey: string;
  externalSessionRef: string;
};

const logger = createLogger({ service: 'connector-runtime' });
const internalNonceStore = createMemoryNonceStore();
const adapters: Map<string, ConnectorAdapter> = await loadConnectorAdapters(
  CONNECTOR_REGISTRY,
  { loader: async (specifier) => await import(specifier) },
);
const actionSessions = new Map<string, ActionSession>();
const app = express();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Array.isArray(value) === false;
}

function headersToRecord(headers: Request['headers']): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers)
      .map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value[0] || '' : value || ''])
      .filter(([, value]) => value !== ''),
  );
}

async function guardInternalAuth(
  req: RawBodyRequest,
  res: Response,
  scopes: string[],
  allowedSubjects: string[],
  audience = INTERNAL_AUTH_CONFIG.serviceId,
): Promise<boolean> {
  if (INTERNAL_AUTH_CONFIG.mode === 'off') return true;
  const verification = await verifyInternalAuthRequest({
    method: req.method,
    path: req.path,
    rawBody: req.rawBody || '',
    headers: req.headers as Record<string, string | string[] | undefined>,
    config: INTERNAL_AUTH_CONFIG,
    nonceStore: internalNonceStore,
    expectedAudience: audience,
    requiredScopes: scopes,
    allowedSubjects,
  });
  if (verification.ok || INTERNAL_AUTH_CONFIG.mode === 'audit') return true;
  res.status(verification.status).json({
    schemaVersion: 'v1',
    error: verification.message,
    code: verification.code,
  });
  return false;
}

async function postInternal<T>(baseUrl: string, serviceId: string, path: string, scopes: string[], body: unknown): Promise<T> {
  const rawBody = JSON.stringify(body);
  const headers = buildInternalAuthHeaders(INTERNAL_AUTH_CONFIG, {
    method: 'POST',
    path,
    rawBody,
    audience: serviceId,
    scopes,
  });
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: headers.authorization,
      'x-uniassist-internal-kid': headers['x-uniassist-internal-kid'],
      'x-uniassist-internal-ts': headers['x-uniassist-internal-ts'],
      'x-uniassist-internal-nonce': headers['x-uniassist-internal-nonce'],
      'x-uniassist-internal-signature': headers['x-uniassist-internal-signature'],
    },
    body: rawBody,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    throw new InternalRequestError(
      response.status,
      typeof payload?.code === 'string' ? payload.code : 'INTERNAL_REQUEST_FAILED',
      typeof payload?.error === 'string' ? payload.error : `${path} responded ${response.status}`,
    );
  }
  return await response.json() as T;
}

async function getInternal<T>(baseUrl: string, serviceId: string, path: string, scopes: string[]): Promise<T> {
  const headers = buildInternalAuthHeaders(INTERNAL_AUTH_CONFIG, {
    method: 'GET',
    path,
    audience: serviceId,
    scopes,
  });
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: {
      authorization: headers.authorization,
      'x-uniassist-internal-kid': headers['x-uniassist-internal-kid'],
      'x-uniassist-internal-ts': headers['x-uniassist-internal-ts'],
      'x-uniassist-internal-nonce': headers['x-uniassist-internal-nonce'],
      'x-uniassist-internal-signature': headers['x-uniassist-internal-signature'],
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    throw new InternalRequestError(
      response.status,
      typeof payload?.code === 'string' ? payload.code : 'INTERNAL_REQUEST_FAILED',
      typeof payload?.error === 'string' ? payload.error : `${path} responded ${response.status}`,
    );
  }
  return await response.json() as T;
}

async function resolveActionSession(publicCallbackKey: string): Promise<ActionSession | undefined> {
  const cached = actionSessions.get(publicCallbackKey);
  if (cached) {
    return cached;
  }
  try {
    const response = await getInternal<WorkflowRuntimeConnectorActionSessionLookupResponse>(
      WORKFLOW_RUNTIME_BASE_URL,
      WORKFLOW_RUNTIME_SERVICE_ID,
      `/internal/runtime/connector-action-sessions/${encodeURIComponent(publicCallbackKey)}`,
      ['connector:lookup'],
    );
    const session: ActionSession = {
      connectorActionSessionId: response.session.connectorActionSessionId,
      connectorKey: response.session.connectorKey,
      action: response.session.action,
      runId: response.session.runId,
      nodeRunId: response.session.nodeRunId,
      publicCallbackKey: response.session.publicCallbackKey,
      externalSessionRef: response.session.externalSessionRef,
    };
    actionSessions.set(publicCallbackKey, session);
    return session;
  } catch (error) {
    if (error instanceof InternalRequestError && error.status === 404) {
      return undefined;
    }
    throw error;
  }
}

app.use((req, res, next) => {
  const startedAt = now();
  res.on('finish', () => {
    logger.info('http request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: now() - startedAt,
    });
  });
  next();
});

app.use(express.json({
  verify: (req, _res, buf) => {
    (req as RawBodyRequest).rawBody = buf.toString('utf8');
  },
}));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'connector-runtime' });
});

app.post('/internal/connectors/actions/invoke', async (req: RawBodyRequest, res) => {
  if (!(await guardInternalAuth(req, res, ['connector:invoke'], [WORKFLOW_RUNTIME_SERVICE_ID]))) return;
  try {
    const body = req.body as ConnectorRuntimeInvokeRequest;
    const adapter = adapters.get(body.action.connectorKey);
    if (!adapter) {
      res.status(404).json({ schemaVersion: 'v1', error: 'connector adapter not found', code: 'CONNECTOR_ADAPTER_NOT_FOUND' });
      return;
    }
    if (body.action.sideEffectClass === 'write' && body.action.browserFallbackMode !== 'disabled') {
      res.status(409).json({ schemaVersion: 'v1', error: 'browser fallback is not allowed for write capabilities', code: 'BROWSER_FALLBACK_WRITE_NOT_ALLOWED' });
      return;
    }
    const result = await adapter.invoke({ request: body, action: body.action });
    if (result.status === 'accepted') {
      const connectorActionSessionId = crypto.randomUUID();
      const publicCallbackKey = crypto.randomUUID();
      actionSessions.set(publicCallbackKey, {
        connectorActionSessionId,
        connectorKey: adapter.connectorKey,
        action: body.action,
        runId: body.runId,
        nodeRunId: body.nodeRunId,
        publicCallbackKey,
        externalSessionRef: result.externalSessionRef,
      });
      const response: ConnectorRuntimeInvokeResponse = {
        schemaVersion: 'v1',
        status: 'accepted',
        externalSessionRef: result.externalSessionRef,
        publicCallbackKey,
        metadata: {
          ...(result.metadata || {}),
          connectorActionSessionId,
        },
      };
      res.json(response);
      return;
    }
    res.json({
      schemaVersion: 'v1',
      status: 'completed',
      externalSessionRef: result.externalSessionRef,
      result: result.result,
      metadata: result.metadata,
    } satisfies ConnectorRuntimeInvokeResponse);
  } catch (error) {
    res.status(500).json({ schemaVersion: 'v1', error: error instanceof Error ? error.message : String(error), code: 'CONNECTOR_INVOKE_FAILED' });
  }
});

app.post('/hooks/connectors/action-callbacks/:publicCallbackKey', async (req: RawBodyRequest, res) => {
  try {
    const session = await resolveActionSession(req.params.publicCallbackKey);
    if (!session) {
      res.status(404).json({ schemaVersion: 'v1', error: 'connector action session not found', code: 'CONNECTOR_ACTION_SESSION_NOT_FOUND' });
      return;
    }
    const adapter = adapters.get(session.connectorKey);
    if (!adapter?.parseActionCallback) {
      res.status(409).json({ schemaVersion: 'v1', error: 'connector does not accept action callbacks', code: 'CONNECTOR_CALLBACK_UNSUPPORTED' });
      return;
    }
    const body = isRecord(req.body) ? req.body : {};
    const normalized = adapter.parseActionCallback({
      action: session.action,
      rawBody: req.rawBody || '',
      body,
      headers: headersToRecord(req.headers),
    });
    const response = await postInternal<unknown>(WORKFLOW_RUNTIME_BASE_URL, WORKFLOW_RUNTIME_SERVICE_ID, '/internal/runtime/connector-callback', ['connector:callback'], {
      schemaVersion: 'v1',
      traceId: crypto.randomUUID(),
      receiptKey: normalized.receiptKey,
      callbackId: normalized.callbackId,
      sequence: normalized.sequence,
      connectorActionSessionId: session.connectorActionSessionId,
      runId: session.runId,
      nodeRunId: session.nodeRunId,
      externalSessionRef: normalized.externalSessionRef,
      kind: normalized.kind,
      emittedAt: normalized.emittedAt,
      payload: normalized.payload,
    } satisfies WorkflowRuntimeConnectorCallbackRequest);
    res.status(202).json(response);
  } catch (error) {
    if (error instanceof InternalRequestError) {
      res.status(error.status).json({ schemaVersion: 'v1', error: error.message, code: error.code });
      return;
    }
    res.status(500).json({ schemaVersion: 'v1', error: error instanceof Error ? error.message : String(error), code: 'CONNECTOR_CALLBACK_FAILED' });
  }
});

app.post('/hooks/connectors/event-subscriptions/:publicSubscriptionKey', async (req: RawBodyRequest, res) => {
  try {
    const runtimeConfig = await getInternal<EventSubscriptionRuntimeConfigResponse>(
      WORKFLOW_PLATFORM_BASE_URL,
      WORKFLOW_PLATFORM_SERVICE_ID,
      `/internal/event-subscriptions/${encodeURIComponent(req.params.publicSubscriptionKey)}/runtime-config`,
      ['connector:event'],
    );
    const subscriptionPath = `/internal/event-subscriptions/${encodeURIComponent(req.params.publicSubscriptionKey)}/dispatch`;
    const body = isRecord(req.body) ? req.body : {};
    const binding = adapters.get(runtimeConfig.eventSubscription.connectorKey);
    if (!binding?.parseEvent) {
      res.status(409).json({ schemaVersion: 'v1', error: 'connector does not support event subscriptions', code: 'CONNECTOR_EVENT_UNSUPPORTED' });
      return;
    }
    const normalized = binding.parseEvent({
      eventType: runtimeConfig.eventSubscription.eventType,
      rawBody: req.rawBody || '',
      body,
      headers: headersToRecord(req.headers),
    });
    const response = await postInternal<unknown>(
      WORKFLOW_PLATFORM_BASE_URL,
      WORKFLOW_PLATFORM_SERVICE_ID,
      subscriptionPath,
      ['connector:event'],
      {
        schemaVersion: 'v1',
        dispatchKey: normalized.receiptKey,
        firedAt: normalized.firedAt,
        payload: normalized.payload,
        headers: headersToRecord(req.headers),
      } satisfies EventSubscriptionDispatchRequest,
    );
    res.status(202).json(response);
  } catch (error) {
    if (error instanceof InternalRequestError) {
      res.status(error.status).json({ schemaVersion: 'v1', error: error.message, code: error.code });
      return;
    }
    res.status(500).json({ schemaVersion: 'v1', error: error instanceof Error ? error.message : String(error), code: 'CONNECTOR_EVENT_DISPATCH_FAILED' });
  }
});

app.listen(PORT, () => {
  logger.info('connector runtime listening', {
    port: PORT,
    connectors: [...adapters.keys()],
  });
});
