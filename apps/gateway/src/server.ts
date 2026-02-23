import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import express from 'express';
import cors from 'cors';

import type {
  ContextPackage,
  DomainEvent,
  IngestAck,
  InteractionEvent,
  ProviderInteractRequest,
  ProviderInteractResponse,
  ProviderEventsRequest,
  ProviderInvokeRequest,
  ProviderInvokeResponse,
  RoutingCandidate,
  RoutingDecision,
  TimelineEvent,
  UnifiedUserInput,
  UserInteraction,
} from '@baseinterface/contracts';
import { createLogger, serializeError } from '@baseinterface/shared';
import { GatewayObservability } from './observability';
import { GatewayPersistence, type StoredSession } from './persistence';

const PORT = Number(process.env.PORT || 8787);
const ADAPTER_SECRET = process.env.UNIASSIST_ADAPTER_SECRET || 'dev-adapter-secret';
const PROVIDER_CONTEXT_TOKEN = process.env.UNIASSIST_PROVIDER_CONTEXT_TOKEN || 'provider-dev-token';
const PLAN_PROVIDER_BASE_URL = (process.env.UNIASSIST_PLAN_PROVIDER_BASE_URL || '').replace(/\/$/, '');
const FALLBACK_PROVIDER_ID = 'builtin_chat';
const ROUTE_THRESHOLD = 0.55;
const STICKY_DEFAULT_BOOST = 0.15;
const STICKY_DECAY_PER_TURN = 0.03;
const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
const TOPIC_DRIFT_THRESHOLD = 0.3;

const app = express();
app.use(cors());
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as RawBodyRequest).rawBody = buf.toString('utf8');
  },
}));

type RawBodyRequest = Request & { rawBody?: string };

type SessionState = StoredSession;

type UserContextResponse = {
  profile: {
    displayName: string;
    tags?: string[];
  };
  preferences: Record<string, unknown>;
  consents: Record<string, boolean>;
  updatedAt: number;
};

type UserContextRecord = {
  profileRef: string;
  userId: string;
  context: UserContextResponse;
};

const sessions = new Map<string, SessionState>();
const timelineBySession = new Map<string, TimelineEvent[]>();
const sseClients = new Map<string, Set<Response>>();
const userContextCache = new Map<string, UserContextRecord>();
const nonceReplay = new Map<string, number>();
const persistence = new GatewayPersistence();
const logger = createLogger({ service: 'gateway' });
const observability = new GatewayObservability();

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

app.use('/v0/ingest', (_req, res, next) => {
  const startedAt = now();
  res.on('finish', () => {
    observability.observeIngest(res.statusCode, now() - startedAt);
  });
  next();
});

const PROVIDER_RULES: Array<{ id: string; keywords: string[] }> = [
  { id: 'plan', keywords: ['计划', '安排', '日程', '目标', '规划'] },
  { id: 'work', keywords: ['工作', '任务', '项目', '会议', '汇报', '交付'] },
  { id: 'reminder', keywords: ['提醒', '记录', '待办', '通知'] },
];

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

function uuid(): string {
  return crypto.randomUUID();
}

function now(): number {
  return Date.now();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function jaccard(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  const inter = [...ta].filter((x) => tb.has(x)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}

async function getOrCreateSession(input: UnifiedUserInput): Promise<{ session: SessionState; rotated: boolean }> {
  let existing = sessions.get(input.sessionId);

  if (!existing && persistence.isEnabled()) {
    const persisted = await persistence.loadSession(input.sessionId);
    if (persisted) {
      existing = persisted;
      sessions.set(existing.sessionId, existing);
    }
  }

  if (!existing) {
    const created: SessionState = {
      sessionId: input.sessionId,
      userId: input.userId,
      seq: 0,
      lastActivityAt: input.timestampMs,
      topicDriftStreak: 0,
      stickyScoreBoost: STICKY_DEFAULT_BOOST,
      switchLeadStreak: 0,
    };
    sessions.set(created.sessionId, created);
    return { session: created, rotated: false };
  }

  if (input.timestampMs - existing.lastActivityAt > SESSION_IDLE_MS) {
    const rotated: SessionState = {
      sessionId: uuid(),
      userId: input.userId,
      seq: 0,
      lastActivityAt: input.timestampMs,
      topicDriftStreak: 0,
      stickyScoreBoost: STICKY_DEFAULT_BOOST,
      switchLeadStreak: 0,
    };
    sessions.set(rotated.sessionId, rotated);
    return { session: rotated, rotated: true };
  }

  existing.lastActivityAt = input.timestampMs;
  return { session: existing, rotated: false };
}

function nextSeq(session: SessionState): number {
  session.seq += 1;
  return session.seq;
}

function pushTimelineEvent(event: TimelineEvent): void {
  const list = timelineBySession.get(event.sessionId) || [];
  list.push(event);
  timelineBySession.set(event.sessionId, list);

  if (persistence.isEnabled()) {
    void persistence.saveTimelineEvent(event).catch((error: unknown) => {
      observability.observePersistenceError();
      logger.error('persistence saveTimelineEvent failed', serializeError(error));
    });
  }

  const clients = sseClients.get(event.sessionId);
  if (!clients) return;

  const payload = JSON.stringify({ schemaVersion: 'v0', type: 'timeline_event', event });
  for (const client of clients) {
    client.write(`data: ${payload}\n\n`);
  }
}

function emitEvent(
  session: SessionState,
  input: UnifiedUserInput,
  kind: TimelineEvent['kind'],
  payload: Record<string, unknown>,
  providerId?: string,
  runId?: string,
): TimelineEvent {
  let extensionKind: TimelineEvent['extensionKind'];
  let renderSchemaRef: TimelineEvent['renderSchemaRef'];

  if (kind === 'interaction') {
    const maybeEvent = payload.event as { type?: string; extensionKind?: TimelineEvent['extensionKind']; payload?: { providerId?: string } } | undefined;
    if (maybeEvent?.type === 'provider_extension' && maybeEvent.extensionKind) {
      extensionKind = maybeEvent.extensionKind;
      if (maybeEvent.payload?.providerId) {
        renderSchemaRef = `v0:${maybeEvent.payload.providerId}:${maybeEvent.extensionKind}`;
      }
    }
  }

  const event: TimelineEvent = {
    schemaVersion: 'v0',
    eventId: uuid(),
    traceId: input.traceId,
    sessionId: session.sessionId,
    userId: input.userId,
    providerId,
    runId,
    seq: nextSeq(session),
    timestampMs: now(),
    kind,
    extensionKind,
    renderSchemaRef,
    payload,
  };

  pushTimelineEvent(event);

  if (kind === 'provider_run' && providerId && runId) {
    const mode = payload.mode === 'sync' ? 'sync' : 'async';
    const routingMode = payload.routing_mode === 'fallback' ? 'fallback' : 'normal';
    const idempotencyKey = typeof payload.idempotency_key === 'string'
      ? payload.idempotency_key
      : `${input.traceId}:${providerId}`;
    const status = typeof payload.status === 'string' ? payload.status : 'in-progress';

    if (persistence.isEnabled()) {
      void persistence.saveProviderRun({
        runId,
        traceId: input.traceId,
        sessionId: session.sessionId,
        userId: input.userId,
        providerId,
        mode,
        routingMode,
        idempotencyKey,
        status,
      }).catch((error: unknown) => {
        observability.observePersistenceError();
        logger.error('persistence saveProviderRun failed', serializeError(error));
      });
    }
  }

  return event;
}

function mergeTimelineEvents(
  inMemory: TimelineEvent[],
  persisted: TimelineEvent[],
): TimelineEvent[] {
  const merged = new Map<string, TimelineEvent>();
  for (const event of [...persisted, ...inMemory]) {
    merged.set(event.eventId, event);
  }
  return [...merged.values()].sort((a, b) => a.seq - b.seq);
}

async function listTimelineEvents(sessionId: string, cursor: number): Promise<TimelineEvent[]> {
  const inMemory = (timelineBySession.get(sessionId) || []).filter((event) => event.seq > cursor);
  if (!persistence.isEnabled()) {
    return inMemory;
  }

  try {
    const persisted = await persistence.listTimelineEvents(sessionId, cursor);
    return mergeTimelineEvents(inMemory, persisted);
  } catch (error) {
    observability.observePersistenceError();
    logger.error('persistence listTimelineEvents failed', serializeError(error));
    return inMemory;
  }
}

function persistSessionAsync(session: SessionState): void {
  if (!persistence.isEnabled()) return;
  void persistence.saveSession(session).catch((error: unknown) => {
    observability.observePersistenceError();
    logger.error('persistence saveSession failed', serializeError(error));
  });
}

function scoreCandidates(session: SessionState, input: UnifiedUserInput): RoutingCandidate[] {
  const text = input.text || '';
  const lowered = text.toLowerCase();

  const scored = PROVIDER_RULES.map((provider) => {
    let score = 0;
    let hitCount = 0;

    for (const keyword of provider.keywords) {
      if (lowered.includes(keyword)) {
        hitCount += 1;
      }
    }

    if (hitCount > 0) {
      score = Math.min(0.95, 0.45 + hitCount * 0.18);
    }

    if (session.stickyProviderId === provider.id) {
      score += session.stickyScoreBoost;
    }

    return {
      providerId: provider.id,
      score: Number(score.toFixed(3)),
      reason: hitCount > 0 ? `matched_keywords:${hitCount}` : 'no-keyword-match',
      requiresClarification: score > 0 && score < ROUTE_THRESHOLD,
      suggestedMode: 'async' as const,
    };
  })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored;
}

function updateTopicDrift(session: SessionState, input: UnifiedUserInput): boolean {
  const text = (input.text || '').trim();
  if (!text) return false;

  if (!session.lastUserText) {
    session.lastUserText = text;
    return false;
  }

  const similarity = jaccard(session.lastUserText, text);
  session.lastUserText = text;

  if (similarity < TOPIC_DRIFT_THRESHOLD) {
    session.topicDriftStreak += 1;
  } else {
    session.topicDriftStreak = 0;
  }

  return session.topicDriftStreak >= 2;
}

function updateStickySignals(session: SessionState, candidates: RoutingCandidate[]): { suggestSwitchTo?: string } {
  session.stickyScoreBoost = Math.max(0, Number((session.stickyScoreBoost - STICKY_DECAY_PER_TURN).toFixed(3)));

  if (!session.stickyProviderId || candidates.length === 0) {
    return {};
  }

  const sticky = candidates.find((c) => c.providerId === session.stickyProviderId);
  const leader = candidates[0];

  if (!sticky || !leader || leader.providerId === sticky.providerId) {
    session.switchLeadProviderId = undefined;
    session.switchLeadStreak = 0;
    return {};
  }

  if (leader.score - sticky.score >= 0.15) {
    if (session.switchLeadProviderId === leader.providerId) {
      session.switchLeadStreak += 1;
    } else {
      session.switchLeadProviderId = leader.providerId;
      session.switchLeadStreak = 1;
    }
  } else {
    session.switchLeadProviderId = undefined;
    session.switchLeadStreak = 0;
  }

  if (session.switchLeadStreak >= 2 && session.switchLeadProviderId) {
    return { suggestSwitchTo: session.switchLeadProviderId };
  }

  return {};
}

function buildFallbackReply(input: UnifiedUserInput): string {
  const text = input.text?.trim();
  if (!text) {
    return '我先作为通用助手接住这条消息。你可以继续补充目标，我会再尝试分发到专项能力。';
  }
  return `当前未命中专项能力，我先继续协助你：${text}`;
}

function buildContextPackage(input: UnifiedUserInput, session: SessionState): ContextPackage {
  return {
    schemaVersion: 'v0',
    user: {
      userId: input.userId,
      locale: input.locale,
      timezone: input.timezone,
    },
    profileSnapshot: {
      displayName: input.userId,
    },
    profileRef: `profile:${input.userId}`,
    permissions: ['context:read'],
    session: {
      sessionId: session.sessionId,
      recentEventsCursor: session.seq,
    },
  };
}

function buildPlanCollectionRequestEvent(taskId: string): InteractionEvent {
  return {
    type: 'provider_extension',
    extensionKind: 'data_collection_request',
    payload: {
      schemaVersion: 'v0',
      providerId: 'plan',
      taskId,
      status: 'pending',
      dataSchema: PLAN_DATA_SCHEMA,
      uiSchema: PLAN_UI_SCHEMA,
    },
  };
}

async function invokePlanProvider(
  input: UnifiedUserInput,
  context: ContextPackage,
  runId: string,
): Promise<InteractionEvent[]> {
  if (!PLAN_PROVIDER_BASE_URL) {
    return [buildPlanCollectionRequestEvent(runId)];
  }

  const requestBody: ProviderInvokeRequest = {
    schemaVersion: 'v0',
    input,
    context,
    run: {
      runId,
      providerId: 'plan',
      attempt: 1,
      idempotencyKey: `${input.traceId}:plan`,
    },
  };

  try {
    const response = await fetch(`${PLAN_PROVIDER_BASE_URL}/v0/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      throw new Error(`provider_invoke_failed:${response.status}`);
    }

    const payload = (await response.json()) as ProviderInvokeResponse;
    const output: InteractionEvent[] = [];
    output.push(payload.ack);
    if (Array.isArray(payload.immediateEvents)) {
      output.push(...payload.immediateEvents);
    }
    return output;
  } catch (error) {
    observability.observeProviderInvokeError();
    logger.warn('plan provider invoke fallback', serializeError(error));
    return [
      {
        type: 'assistant_message',
        text: 'plan 专项暂时不可用，已切换入口内置流程继续处理。',
      },
      buildPlanCollectionRequestEvent(runId),
    ];
  }
}

async function interactPlanProvider(
  interaction: UserInteraction,
  context: ContextPackage,
): Promise<InteractionEvent[] | null> {
  if (!PLAN_PROVIDER_BASE_URL) {
    return null;
  }

  const requestBody: ProviderInteractRequest = {
    schemaVersion: 'v0',
    interaction,
    context,
    run: {
      runId: interaction.runId,
      attempt: 1,
      idempotencyKey: `${interaction.traceId}:${interaction.runId}:interact`,
    },
  };

  try {
    const response = await fetch(`${PLAN_PROVIDER_BASE_URL}/v0/interact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      throw new Error(`provider_interact_failed:${response.status}`);
    }
    const payload = (await response.json()) as ProviderInteractResponse;
    return payload.events || [];
  } catch (error) {
    observability.observeProviderInteractError();
    logger.warn('plan provider interact fallback', serializeError(error));
    return [
      {
        type: 'error',
        userMessage: 'plan 专项交互失败，入口将使用本地流程继续。',
        retryable: true,
      },
    ];
  }
}

async function dispatchPlanProviderRun(
  session: SessionState,
  input: UnifiedUserInput,
  runId: string,
  context: ContextPackage,
): Promise<void> {
  const providerEvents = await invokePlanProvider(input, context, runId);
  providerEvents.forEach((event) => {
    emitEvent(session, input, 'interaction', {
      event,
      source: 'provider',
    }, 'plan', runId);
  });
}

function requireExternalSignature(req: RawBodyRequest): { ok: true } | { ok: false; message: string } {
  const signature = req.header('x-uniassist-signature');
  const ts = req.header('x-uniassist-timestamp');
  const nonce = req.header('x-uniassist-nonce');

  if (!signature || !ts || !nonce) {
    return { ok: false, message: 'missing signature headers' };
  }

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, message: 'invalid timestamp' };
  }

  const drift = Math.abs(now() - tsNum);
  if (drift > 5 * 60 * 1000) {
    return { ok: false, message: 'timestamp expired' };
  }

  const usedAt = nonceReplay.get(nonce);
  if (usedAt && now() - usedAt < 5 * 60 * 1000) {
    return { ok: false, message: 'nonce replayed' };
  }

  const raw = req.rawBody || '';
  const expected = crypto
    .createHmac('sha256', ADAPTER_SECRET)
    .update(`${ts}.${nonce}.${raw}`)
    .digest('hex');

  const actualBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return { ok: false, message: 'invalid signature' };
  }

  nonceReplay.set(nonce, now());
  return { ok: true };
}

async function loadOutboxMetricsSnapshot() {
  if (!persistence.isEnabled()) return null;
  try {
    return await persistence.getOutboxMetricsSnapshot();
  } catch (error) {
    observability.observePersistenceError();
    logger.error('persistence getOutboxMetricsSnapshot failed', serializeError(error));
    return null;
  }
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'gateway',
    version: '0.1.0',
    persistence: {
      enabled: persistence.isEnabled(),
      postgres: Boolean(process.env.DATABASE_URL),
      redis: Boolean(process.env.REDIS_URL),
    },
  });
});

app.get('/v0/metrics', async (_req, res) => {
  const outbox = await loadOutboxMetricsSnapshot();
  res.json({
    schemaVersion: 'v0',
    service: 'gateway',
    timestampMs: now(),
    metrics: observability.snapshot(outbox),
  });
});

app.get('/metrics', async (_req, res) => {
  const outbox = await loadOutboxMetricsSnapshot();
  res.type('text/plain');
  res.send(observability.toPrometheus(outbox));
});

app.get('/.well-known/uniassist/manifest.json', (_req, res) => {
  res.json({
    schemaVersion: 'v0',
    providerId: 'builtin_chat',
    name: 'Builtin Chat Fallback',
    version: '0.1.0',
    description: 'Fallback provider for unclassified requests.',
    capabilities: {
      inputs: ['text', 'image', 'audio', 'file'],
      interactionEvents: ['ack', 'assistant_message', 'card', 'request_clarification', 'provider_extension'],
      streaming: true,
    },
  });
});

app.post('/v0/ingest', async (req: RawBodyRequest, res) => {
  const input = req.body as UnifiedUserInput;

  if (!input || input.schemaVersion !== 'v0' || !input.traceId || !input.userId || !input.sessionId) {
    res.status(400).json({
      schemaVersion: 'v0',
      type: 'https://uniassist/errors/invalid_request',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_REQUEST',
      detail: 'schemaVersion/traceId/userId/sessionId are required',
    });
    return;
  }

  if (input.source !== 'app') {
    const signed = requireExternalSignature(req);
    if (!signed.ok) {
      res.status(401).json({
        schemaVersion: 'v0',
        type: 'https://uniassist/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        code: 'INVALID_SIGNATURE',
        detail: signed.message,
        traceId: input.traceId,
      });
      return;
    }
  }

  const { session, rotated } = await getOrCreateSession(input);
  const effectiveInput: UnifiedUserInput = {
    ...input,
    sessionId: session.sessionId,
    timestampMs: input.timestampMs || now(),
  };

  emitEvent(session, effectiveInput, 'inbound', { input: effectiveInput });

  const topicDriftSuggested = updateTopicDrift(session, effectiveInput);
  const candidates = scoreCandidates(session, effectiveInput);
  const stickySignal = updateStickySignals(session, candidates);

  const selected = candidates.filter((candidate) => candidate.score >= ROUTE_THRESHOLD).slice(0, 2);
  const requiresConfirmation = selected.length > 1 && selected[0].score - selected[1].score < 0.1;

  if (selected.length > 0 && !session.stickyProviderId) {
    session.stickyProviderId = selected[0].providerId;
    session.stickyScoreBoost = STICKY_DEFAULT_BOOST;
    session.lastSwitchTs = now();
  }

  const routing: RoutingDecision = {
    schemaVersion: 'v0',
    traceId: effectiveInput.traceId,
    sessionId: session.sessionId,
    candidates,
    requiresUserConfirmation: requiresConfirmation,
    fallback: selected.length === 0 ? 'builtin_chat' : 'none',
    timestampMs: now(),
  };

  emitEvent(session, effectiveInput, 'routing_decision', routing as unknown as Record<string, unknown>);

  const runs: IngestAck['runs'] = [];
  const ackEvents: InteractionEvent[] = [];
  const contextPackage = buildContextPackage(effectiveInput, session);

  if (rotated) {
    ackEvents.push({
      type: 'ack',
      message: '由于会话长期闲置，已自动创建新会话继续处理。',
    });
  }

  if (selected.length === 0) {
    const runId = uuid();
    runs.push({ providerId: FALLBACK_PROVIDER_ID, runId, mode: 'async' });

    emitEvent(session, effectiveInput, 'provider_run', {
      providerId: FALLBACK_PROVIDER_ID,
      mode: 'async',
      status: 'in-progress',
      routing_mode: 'fallback',
      idempotency_key: `${effectiveInput.traceId}:${FALLBACK_PROVIDER_ID}`,
      context: contextPackage,
    }, FALLBACK_PROVIDER_ID, runId);

    ackEvents.push({
      type: 'ack',
      message: '未命中专项能力，已自动进入通用助手。',
    });

    const fallbackReply: InteractionEvent = {
      type: 'assistant_message',
      text: buildFallbackReply(effectiveInput),
    };

    emitEvent(session, effectiveInput, 'interaction', {
      event: fallbackReply,
      source: 'fallback',
    }, FALLBACK_PROVIDER_ID, runId);
  } else {
    for (const candidate of selected) {
      const runId = uuid();
      runs.push({ providerId: candidate.providerId, runId, mode: 'async' });

      emitEvent(session, effectiveInput, 'provider_run', {
        providerId: candidate.providerId,
        mode: 'async',
        score: candidate.score,
        status: 'in-progress',
        routing_mode: 'normal',
        idempotency_key: `${effectiveInput.traceId}:${candidate.providerId}`,
        context: contextPackage,
      }, candidate.providerId, runId);

      ackEvents.push({
        type: 'ack',
        message: `已分发到 ${candidate.providerId} 专项处理。`,
      });

      if (candidate.providerId === 'plan') {
        void dispatchPlanProviderRun(session, effectiveInput, runId, contextPackage);
      } else {
        const msg: InteractionEvent = {
          type: 'assistant_message',
          text: `${candidate.providerId} 专项已开始处理。`,
        };
        emitEvent(session, effectiveInput, 'interaction', { event: msg, source: 'provider' }, candidate.providerId, runId);
      }
    }
  }

  if (topicDriftSuggested) {
    const driftHint: InteractionEvent = {
      type: 'card',
      title: '检测到话题变化较大',
      body: '建议新建会话保持上下文清晰。',
      actions: [{ actionId: 'new_session:auto', label: '新建会话', style: 'secondary' }],
    };
    emitEvent(session, effectiveInput, 'interaction', { event: driftHint, source: 'system' });
  }

  if (stickySignal.suggestSwitchTo) {
    const switchHint: InteractionEvent = {
      type: 'card',
      title: `建议切换到 ${stickySignal.suggestSwitchTo}`,
      body: '检测到当前输入更匹配另一个专项能力。',
      actions: [{ actionId: `switch_provider:${stickySignal.suggestSwitchTo}`, label: '切换', style: 'primary' }],
    };
    emitEvent(session, effectiveInput, 'interaction', { event: switchHint, source: 'system' });
  }

  const ack: IngestAck = {
    schemaVersion: 'v0',
    traceId: effectiveInput.traceId,
    sessionId: session.sessionId,
    userId: effectiveInput.userId,
    routing,
    runs,
    ackEvents,
    stream: {
      type: 'sse',
      href: `/v0/stream?sessionId=${encodeURIComponent(session.sessionId)}&cursor=${session.seq}`,
      cursor: session.seq,
    },
    timestampMs: now(),
  };

  persistSessionAsync(session);
  res.json(ack);
});

app.post('/v0/interact', async (req, res) => {
  const interaction = req.body as UserInteraction;
  if (!interaction || interaction.schemaVersion !== 'v0') {
    res.status(400).json({ accepted: false, reason: 'invalid interaction' });
    return;
  }

  let session = sessions.get(interaction.sessionId);
  if (!session && persistence.isEnabled()) {
    const persisted = await persistence.loadSession(interaction.sessionId);
    if (persisted) {
      session = persisted;
      sessions.set(session.sessionId, session);
    }
  }
  if (!session) {
    res.status(404).json({ accepted: false, reason: 'session not found' });
    return;
  }

  const inputRef: UnifiedUserInput = {
    schemaVersion: 'v0',
    traceId: interaction.traceId,
    userId: interaction.userId,
    sessionId: interaction.sessionId,
    source: 'app',
    timestampMs: now(),
  };

  emitEvent(session, inputRef, 'user_interaction', interaction as unknown as Record<string, unknown>, interaction.providerId, interaction.runId);

  if (interaction.actionId.startsWith('switch_provider:')) {
    const nextProvider = interaction.actionId.replace('switch_provider:', '');
    session.stickyProviderId = nextProvider;
    session.stickyScoreBoost = STICKY_DEFAULT_BOOST;
    session.lastSwitchTs = now();
    session.switchLeadProviderId = undefined;
    session.switchLeadStreak = 0;

    const switched: InteractionEvent = {
      type: 'assistant_message',
      text: `已切换到 ${nextProvider} 专项。后续将优先按该专项处理。`,
    };

    emitEvent(session, inputRef, 'interaction', { event: switched, source: 'system' }, nextProvider, interaction.runId);
  }

  if (interaction.actionId.startsWith('new_session:')) {
    const newSessionId = uuid();
    const next: SessionState = {
      sessionId: newSessionId,
      userId: interaction.userId,
      seq: 0,
      lastActivityAt: now(),
      topicDriftStreak: 0,
      stickyScoreBoost: STICKY_DEFAULT_BOOST,
      switchLeadStreak: 0,
    };
    sessions.set(newSessionId, next);
    persistSessionAsync(next);

    res.json({ accepted: true, newSessionId });
    return;
  }

  if (interaction.actionId.startsWith('submit_data_collection')) {
    const contextPackage = buildContextPackage(inputRef, session);
    const providerEvents = interaction.providerId === 'plan'
      ? await interactPlanProvider(interaction, contextPackage)
      : null;

    if (providerEvents && providerEvents.length > 0) {
      providerEvents.forEach((event) => {
        emitEvent(session, inputRef, 'interaction', { event, source: 'provider' }, interaction.providerId, interaction.runId);
      });
    } else {
      const progress: InteractionEvent = {
        type: 'provider_extension',
        extensionKind: 'data_collection_progress',
        payload: {
          schemaVersion: 'v0',
          providerId: interaction.providerId,
          taskId: interaction.runId,
          progress: { step: 1, total: 1, label: '资料已接收，正在分析' },
          status: 'in_progress',
        },
      };

      const result: InteractionEvent = {
        type: 'provider_extension',
        extensionKind: 'data_collection_result',
        payload: {
          schemaVersion: 'v0',
          providerId: interaction.providerId,
          taskId: interaction.runId,
          dataSchema: PLAN_DATA_SCHEMA,
          uiSchema: PLAN_UI_SCHEMA,
          values: interaction.payload,
          status: 'completed',
        },
      };

      emitEvent(session, inputRef, 'interaction', { event: progress, source: 'provider' }, interaction.providerId, interaction.runId);
      emitEvent(session, inputRef, 'interaction', { event: result, source: 'provider' }, interaction.providerId, interaction.runId);
    }
  }

  persistSessionAsync(session);
  res.json({ accepted: true });
});

app.post('/v0/events', (req, res) => {
  const body = req.body as ProviderEventsRequest;
  if (!body || body.schemaVersion !== 'v0' || !Array.isArray(body.events)) {
    res.status(400).json({ schemaVersion: 'v0', accepted: 0, rejected: 1, errors: [{ index: 0, code: 'INVALID_REQUEST', message: 'invalid payload' }] });
    return;
  }

  let accepted = 0;
  let rejected = 0;
  const errors: Array<{ index: number; code: string; message: string }> = [];

  body.events.forEach((item: ProviderEventsRequest['events'][number], index: number) => {
    try {
      if (item.kind === 'interaction') {
        const session = sessions.get(item.sessionId);
        if (!session) {
          throw new Error('session_not_found');
        }

        const inputRef: UnifiedUserInput = {
          schemaVersion: 'v0',
          traceId: item.traceId,
          userId: item.userId,
          sessionId: item.sessionId,
          source: 'api',
          timestampMs: item.timestampMs,
        };

        emitEvent(session, inputRef, 'interaction', { event: item.event, source: 'provider' }, body.providerId, item.runId);
      } else {
        const event = item.event as DomainEvent;
        const sessionId = event.sessionId || uuid();
        const session = sessions.get(sessionId) || {
          sessionId,
          userId: event.userId,
          seq: 0,
          lastActivityAt: now(),
          topicDriftStreak: 0,
          stickyScoreBoost: STICKY_DEFAULT_BOOST,
          switchLeadStreak: 0,
        };

        sessions.set(sessionId, session);
        persistSessionAsync(session);

        const inputRef: UnifiedUserInput = {
          schemaVersion: 'v0',
          traceId: event.traceId || uuid(),
          userId: event.userId,
          sessionId,
          source: 'api',
          timestampMs: event.timestampMs,
        };

        emitEvent(session, inputRef, 'domain_event', { event }, body.providerId);
      }

      accepted += 1;
    } catch (error) {
      rejected += 1;
      errors.push({ index, code: 'EVENT_REJECTED', message: String(error) });
    }
  });

  res.json({ schemaVersion: 'v0', accepted, rejected, errors: errors.length ? errors : undefined });
});

app.get('/v0/stream', async (req, res) => {
  const sessionId = String(req.query.sessionId || '');
  const cursor = Number(req.query.cursor || 0);

  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const seed = await listTimelineEvents(sessionId, cursor);
  for (const event of seed) {
    res.write(`data: ${JSON.stringify({ schemaVersion: 'v0', type: 'timeline_event', event })}\n\n`);
  }

  const clients = sseClients.get(sessionId) || new Set<Response>();
  clients.add(res);
  sseClients.set(sessionId, clients);

  req.on('close', () => {
    clients.delete(res);
    if (clients.size === 0) sseClients.delete(sessionId);
  });
});

app.get('/v0/timeline', async (req, res) => {
  const sessionId = String(req.query.sessionId || '');
  const cursor = Number(req.query.cursor || 0);

  if (!sessionId) {
    res.status(400).json({ events: [], nextCursor: cursor });
    return;
  }

  const events = await listTimelineEvents(sessionId, cursor);
  const nextCursor = events.length > 0 ? events[events.length - 1].seq : cursor;
  res.json({ schemaVersion: 'v0', events, nextCursor });
});

app.get('/v0/context/users/:profileRef', async (req, res) => {
  const auth = req.header('authorization');
  if (auth !== `Bearer ${PROVIDER_CONTEXT_TOKEN}`) {
    res.status(401).json({
      schemaVersion: 'v0',
      type: 'https://uniassist/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      code: 'INVALID_PROVIDER_TOKEN',
      detail: 'provider token missing or invalid',
    });
    return;
  }

  const scopes = (req.header('x-provider-scopes') || '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!scopes.includes('context:read') && !scopes.includes('*')) {
    res.status(403).json({
      schemaVersion: 'v0',
      type: 'https://uniassist/errors/forbidden',
      title: 'Forbidden',
      status: 403,
      code: 'MISSING_SCOPE',
      detail: 'scope context:read is required',
    });
    return;
  }

  const profileRef = req.params.profileRef;
  const existing = userContextCache.get(profileRef);
  if (existing) {
    res.json(existing.context);
    return;
  }

  if (persistence.isEnabled()) {
    const persisted = await persistence.loadUserContext(profileRef);
    if (persisted) {
      const restored = persisted as UserContextResponse;
      userContextCache.set(profileRef, {
        profileRef,
        userId: profileRef.replace(/^profile:/, ''),
        context: restored,
      });
      res.json(restored);
      return;
    }
  }

  const generated: UserContextRecord = {
    profileRef,
    userId: profileRef.replace(/^profile:/, ''),
    context: {
      profile: {
        displayName: 'Demo User',
        tags: ['default'],
      },
      preferences: {
        locale: 'zh-CN',
        focusMode: 'balanced',
      },
      consents: {
        profileSharing: true,
      },
      updatedAt: now(),
    },
  };

  userContextCache.set(profileRef, generated);
  if (persistence.isEnabled()) {
    void persistence.saveUserContext({
      profileRef,
      userId: generated.userId,
      snapshot: generated.context as Record<string, unknown>,
      ttlMs: 24 * 60 * 60 * 1000,
    }).catch((error: unknown) => {
      observability.observePersistenceError();
      logger.error('persistence saveUserContext failed', serializeError(error));
    });
  }
  res.json(generated.context);
});

const server = app.listen(PORT, async () => {
  try {
    await persistence.init();
  } catch (error) {
    observability.observePersistenceError();
    logger.error('persistence init failed, continue with in-memory mode', serializeError(error));
  }
  logger.info('gateway listening', { port: PORT });
});

async function shutdown(): Promise<void> {
  await persistence.close().catch((error: unknown) => {
    observability.observePersistenceError();
    logger.error('persistence close failed', serializeError(error));
  });
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
