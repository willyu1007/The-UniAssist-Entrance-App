import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import express from 'express';

import type {
  InteractionEvent,
  ProviderInteractRequest,
  ProviderInteractResponse,
  ProviderInvokeRequest,
  ProviderInvokeResponse,
  TaskQuestionExtensionEvent,
  TaskStateExtensionEvent,
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

type RawBodyRequest = Request & { rawBody?: string };

type InternalAuthOptions = {
  endpoint: string;
  requiredScopes: string[];
  traceId?: string;
};

type PlanTaskMemory = {
  goal?: string;
  dueDate?: string;
};

const planTaskMemory = new Map<string, PlanTaskMemory>();

const GOAL_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string', title: '任务目标' },
  },
  required: ['text'],
};

const DUE_DATE_SCHEMA = {
  type: 'object',
  properties: {
    dueDate: { type: 'string', title: '目标日期' },
  },
  required: ['dueDate'],
};

const GOAL_UI_SCHEMA = {
  order: ['text'],
};

const DUE_DATE_UI_SCHEMA = {
  order: ['dueDate'],
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

function buildTaskQuestion(
  runId: string,
  taskId: string,
  questionId: string,
  prompt: string,
  answerSchema: Record<string, unknown>,
  uiSchema: Record<string, unknown>,
): TaskQuestionExtensionEvent {
  return {
    type: 'provider_extension',
    extensionKind: 'task_question',
    payload: {
      schemaVersion: 'v0',
      providerId: 'plan',
      runId,
      taskId,
      questionId,
      replyToken: crypto.randomUUID(),
      prompt,
      answerSchema,
      uiSchema,
    },
  };
}

function buildTaskState(
  runId: string,
  taskId: string,
  state: TaskStateExtensionEvent['payload']['state'],
  executionPolicy: TaskStateExtensionEvent['payload']['executionPolicy'],
  metadata?: Record<string, unknown>,
): TaskStateExtensionEvent {
  return {
    type: 'provider_extension',
    extensionKind: 'task_state',
    payload: {
      schemaVersion: 'v0',
      providerId: 'plan',
      runId,
      taskId,
      state,
      executionPolicy,
      metadata,
    },
  };
}

function normalizeTaskId(body: ProviderInteractRequest): string {
  return body.interaction.inReplyTo?.taskId || body.interaction.runId;
}

function extractGoalText(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) return undefined;
  if (typeof payload.text === 'string' && payload.text.trim()) return payload.text.trim();
  if (typeof payload.goal === 'string' && payload.goal.trim()) return payload.goal.trim();
  return undefined;
}

function extractDueDate(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) return undefined;
  if (typeof payload.dueDate === 'string' && payload.dueDate.trim()) return payload.dueDate.trim();
  return undefined;
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
    version: '0.2.0',
    description: 'Planning provider for UniAssist v0 task orchestration.',
    capabilities: {
      inputs: ['text'],
      interactionEvents: ['ack', 'assistant_message', 'provider_extension', 'request_clarification', 'card'],
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

  const taskId = `task:${body.run.runId}`;
  planTaskMemory.set(taskId, {});

  const ack: InteractionEvent = {
    type: 'ack',
    message: 'plan 专项已接收请求，先确认任务目标。',
  };

  const response: ProviderInvokeResponse = {
    schemaVersion: 'v0',
    runId: body.run.runId,
    providerId: 'plan',
    ack,
    immediateEvents: [
      buildTaskQuestion(
        body.run.runId,
        taskId,
        `${taskId}:goal`,
        '请告诉我这次计划的核心目标。',
        GOAL_SCHEMA,
        GOAL_UI_SCHEMA,
      ),
    ],
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

  const taskId = normalizeTaskId(body);
  const actionId = body.interaction.actionId;
  const task = planTaskMemory.get(taskId) || {};
  const events: InteractionEvent[] = [];

  if (actionId.startsWith('answer_task_question') || actionId.startsWith('submit_data_collection')) {
    const goal = extractGoalText(body.interaction.payload);
    const dueDate = extractDueDate(body.interaction.payload);

    if (goal && !task.goal) task.goal = goal;
    if (dueDate && !task.dueDate) task.dueDate = dueDate;

    if (!task.goal) {
      events.push(buildTaskQuestion(body.run.runId, taskId, `${taskId}:goal`, '我还缺少任务目标，请补充。', GOAL_SCHEMA, GOAL_UI_SCHEMA));
      planTaskMemory.set(taskId, task);
    } else if (!task.dueDate) {
      events.push(buildTaskQuestion(body.run.runId, taskId, `${taskId}:dueDate`, '请补充目标日期（例如 2026-03-31）。', DUE_DATE_SCHEMA, DUE_DATE_UI_SCHEMA));
      planTaskMemory.set(taskId, task);
    } else {
      planTaskMemory.set(taskId, task);
      events.push(
        buildTaskState(body.run.runId, taskId, 'ready', 'require_user_confirm', {
          goal: task.goal,
          dueDate: task.dueDate,
          missingFields: [],
        }),
      );
      events.push({
        type: 'assistant_message',
        text: '信息已完整，我已准备执行。请确认是否开始执行任务。',
      });
    }
  } else if (actionId.startsWith('execute_task')) {
    if (!task.goal) {
      events.push(buildTaskQuestion(body.run.runId, taskId, `${taskId}:goal`, '执行前需要先确认任务目标。', GOAL_SCHEMA, GOAL_UI_SCHEMA));
    } else {
      events.push(buildTaskState(body.run.runId, taskId, 'executing', 'require_user_confirm', {
        goal: task.goal,
        dueDate: task.dueDate,
      }));
      events.push({
        type: 'assistant_message',
        text: `正在执行任务：${task.goal}${task.dueDate ? `（截止 ${task.dueDate}）` : ''}`,
      });
      events.push(buildTaskState(body.run.runId, taskId, 'completed', 'require_user_confirm', {
        goal: task.goal,
        dueDate: task.dueDate,
      }));
      events.push({
        type: 'assistant_message',
        text: '任务执行流程已完成，你可以继续追加细化要求。',
      });
    }
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
