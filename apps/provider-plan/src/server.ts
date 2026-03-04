import type { Request, Response } from 'express';
import express from 'express';

import type {
  InteractionEvent,
  ProviderInteractRequest,
  ProviderInteractResponse,
  ProviderInvokeRequest,
  ProviderInvokeResponse,
} from '@baseinterface/contracts';
import {
  createLogger,
  createMemoryNonceStore,
  loadInternalAuthConfigFromEnv,
  verifyInternalAuthRequest,
} from '@baseinterface/shared';

const PORT = Number(process.env.PORT || 8890);
const INTERNAL_AUTH_DEFAULT_SERVICE_ID = 'provider-plan';
const INTERNAL_AUTH_CONFIG = (() => {
  const config = loadInternalAuthConfigFromEnv(process.env);
  if (config.serviceId === 'unknown') {
    config.serviceId = INTERNAL_AUTH_DEFAULT_SERVICE_ID;
  }
  return config;
})();
const logger = createLogger({ service: 'provider-plan' });
const internalNonceStore = createMemoryNonceStore();

const PLAN_DATA_SCHEMA = {
  type: 'object',
  properties: {
    goal: { type: 'string', title: '本次目标' },
    dueDate: { type: 'string', title: '目标日期' },
  },
  required: ['goal'],
};

const PLAN_UI_SCHEMA = {
  order: ['goal', 'dueDate'],
};

type RawBodyRequest = Request & { rawBody?: string };

type InternalAuthOptions = {
  endpoint: string;
  requiredScopes: string[];
  traceId?: string;
};

function buildAuthError(
  status: 401 | 403,
  code: string,
  detail: string,
  traceId?: string,
): Record<string, unknown> {
  return {
    schemaVersion: 'v0',
    type: status === 403 ? 'https://uniassist/errors/forbidden' : 'https://uniassist/errors/unauthorized',
    title: status === 403 ? 'Forbidden' : 'Unauthorized',
    status,
    code,
    detail,
    traceId,
  };
}

async function guardInternalAuth(
  req: RawBodyRequest,
  res: Response,
  options: InternalAuthOptions,
): Promise<boolean> {
  if (INTERNAL_AUTH_CONFIG.mode === 'off') return true;

  const verification = await verifyInternalAuthRequest({
    method: req.method,
    path: req.path,
    rawBody: req.rawBody || '',
    headers: req.headers as Record<string, string | string[] | undefined>,
    config: INTERNAL_AUTH_CONFIG,
    nonceStore: internalNonceStore,
    expectedAudience: INTERNAL_AUTH_CONFIG.serviceId,
    requiredScopes: options.requiredScopes,
    allowedSubjects: ['gateway'],
  });

  if (verification.ok) return true;

  logger.warn('internal auth denied', {
    endpoint: options.endpoint,
    mode: INTERNAL_AUTH_CONFIG.mode,
    code: verification.code,
    detail: verification.message,
    traceId: options.traceId,
    subject: verification.claims?.sub,
    audience: verification.claims?.aud,
    requiredScopes: options.requiredScopes,
  });

  if (INTERNAL_AUTH_CONFIG.mode === 'audit') return true;

  res.status(verification.status).json(
    buildAuthError(verification.status, verification.code, verification.message, options.traceId),
  );
  return false;
}

function buildCollectionRequest(taskId: string): InteractionEvent {
  return {
    type: 'provider_extension',
    extensionKind: 'data_collection_request',
    payload: {
      schemaVersion: 'v0',
      providerId: 'plan',
      taskId,
      dataSchema: PLAN_DATA_SCHEMA,
      uiSchema: PLAN_UI_SCHEMA,
      status: 'pending',
    },
  };
}

const app = express();
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as RawBodyRequest).rawBody = buf.toString('utf8');
  },
}));

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info('http request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'provider-plan' });
});

app.get('/.well-known/uniassist/manifest.json', (_req, res) => {
  res.json({
    schemaVersion: 'v0',
    providerId: 'plan',
    name: 'Plan Provider',
    version: '0.1.0',
    description: 'Planning provider for UniAssist v0.',
    capabilities: {
      inputs: ['text'],
      interactionEvents: ['ack', 'assistant_message', 'provider_extension', 'request_clarification'],
      streaming: true,
    },
    navigation: {
      settingsHref: '/settings/plan',
      detailHref: '/providers/plan',
      progressHref: '/providers/plan/progress',
    },
    sla: {
      ackWithinMs: 800,
      maxSyncResponseMs: 5000,
    },
    security: {
      auth: 'client_credentials',
      requiredScopes: ['provider:invoke', 'provider:interact', 'context:read'],
    },
  });
});

app.post('/v0/invoke', async (req: RawBodyRequest, res) => {
  const traceId = (req.body as ProviderInvokeRequest | undefined)?.input?.traceId;
  const authorized = await guardInternalAuth(req, res, {
    endpoint: '/v0/invoke',
    requiredScopes: ['provider:invoke'],
    traceId,
  });
  if (!authorized) return;

  const body = req.body as ProviderInvokeRequest;
  if (!body || body.schemaVersion !== 'v0' || body.run.providerId !== 'plan') {
    res.status(400).json({
      schemaVersion: 'v0',
      type: 'https://uniassist/errors/invalid_request',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_INVOKE_REQUEST',
      detail: 'schemaVersion/run.providerId are invalid',
    });
    return;
  }

  const ack: InteractionEvent = {
    type: 'ack',
    message: 'plan 专项已接收请求，正在准备资料收集表单。',
  };

  const response: ProviderInvokeResponse = {
    schemaVersion: 'v0',
    runId: body.run.runId,
    providerId: 'plan',
    ack,
    immediateEvents: [buildCollectionRequest(body.run.runId)],
  };

  res.json(response);
});

app.post('/v0/interact', async (req: RawBodyRequest, res) => {
  const traceId = (req.body as ProviderInteractRequest | undefined)?.interaction?.traceId;
  const authorized = await guardInternalAuth(req, res, {
    endpoint: '/v0/interact',
    requiredScopes: ['provider:interact'],
    traceId,
  });
  if (!authorized) return;

  const body = req.body as ProviderInteractRequest;
  if (!body || body.schemaVersion !== 'v0') {
    res.status(400).json({
      schemaVersion: 'v0',
      type: 'https://uniassist/errors/invalid_request',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_INTERACT_REQUEST',
      detail: 'schemaVersion is required',
    });
    return;
  }

  const events: InteractionEvent[] = [];

  if (body.interaction.actionId.startsWith('submit_data_collection')) {
    events.push({
      type: 'provider_extension',
      extensionKind: 'data_collection_progress',
      payload: {
        schemaVersion: 'v0',
        providerId: 'plan',
        taskId: body.interaction.runId,
        progress: { step: 1, total: 1, label: '资料已接收，正在生成计划' },
        status: 'in_progress',
      },
    });

    events.push({
      type: 'provider_extension',
      extensionKind: 'data_collection_result',
      payload: {
        schemaVersion: 'v0',
        providerId: 'plan',
        taskId: body.interaction.runId,
        dataSchema: PLAN_DATA_SCHEMA,
        uiSchema: PLAN_UI_SCHEMA,
        values: body.interaction.payload,
        status: 'completed',
      },
    });

    events.push({
      type: 'assistant_message',
      text: '已根据你提交的资料生成初版计划，可继续细化执行步骤。',
    });
  } else {
    events.push({
      type: 'ack',
      message: 'plan 专项已收到交互动作。',
    });
  }

  const response: ProviderInteractResponse = {
    schemaVersion: 'v0',
    runId: body.run.runId,
    events,
  };

  res.json(response);
});

app.listen(PORT, () => {
  if (INTERNAL_AUTH_CONFIG.replayBackend === 'redis') {
    logger.warn('internal auth replay backend requested redis but provider currently uses in-memory nonce store', {
      requestedReplayBackend: INTERNAL_AUTH_CONFIG.replayBackend,
    });
  }
  logger.info('provider-plan listening', { port: PORT });
});
