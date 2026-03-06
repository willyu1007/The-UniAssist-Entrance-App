import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import express from 'express';
import cors from 'cors';

import type {
  ContextPackage,
  DomainEvent,
  IngestAck,
  InteractionEvent,
  ProviderManifest,
  ProviderInteractRequest,
  ProviderInteractResponse,
  ProviderEventsRequest,
  ProviderInvokeRequest,
  ProviderInvokeResponse,
  RoutingCandidate,
  RoutingDecision,
  TaskExecutionPolicy,
  TaskLifecycleState,
  TaskStateExtensionEvent,
  TimelineEvent,
  UnifiedUserInput,
  UserInteraction,
} from '@baseinterface/contracts';
import {
  buildInternalAuthHeaders,
  createLogger,
  createMemoryNonceStore,
  loadInternalAuthConfigFromEnv,
  serializeError,
  verifyInternalAuthRequest,
  type InternalAuthDenyCode,
} from '@baseinterface/shared';
import { GatewayObservability } from './observability';
import { GatewayPersistence, type StoredSession, type TaskThreadRecord } from './persistence';

const PORT = Number(process.env.PORT || 8787);
const ADAPTER_SECRET = process.env.UNIASSIST_ADAPTER_SECRET || 'dev-adapter-secret';
const FALLBACK_PROVIDER_ID = 'builtin_chat';
const ROUTE_THRESHOLD = 0.55;
const STICKY_DEFAULT_BOOST = 0.15;
const STICKY_DECAY_PER_TURN = 0.03;
const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
const TOPIC_DRIFT_THRESHOLD = 0.3;
const INTERNAL_AUTH_DEFAULT_SERVICE_ID = 'gateway';
const PROVIDER_TIMEOUT_MS = 5000;
const PROVIDER_MAX_ATTEMPTS = 3;
const PROVIDER_RETRY_DELAYS_MS = [300, 900];
const PROVIDER_CIRCUIT_OPEN_AFTER_FAILURES = 5;
const PROVIDER_CIRCUIT_OPEN_MS = 30 * 1000;
const PROVIDER_CIRCUIT_WINDOW_MS = 60 * 1000;

const INTERNAL_AUTH_CONFIG = (() => {
  const config = loadInternalAuthConfigFromEnv(process.env);
  if (config.serviceId === 'unknown') {
    config.serviceId = INTERNAL_AUTH_DEFAULT_SERVICE_ID;
  }
  return config;
})();

const app = express();
app.use(cors());
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as RawBodyRequest).rawBody = buf.toString('utf8');
  },
}));

type RawBodyRequest = Request & { rawBody?: string };

type SessionState = StoredSession;

type ProviderRegistryEntry = {
  providerId: string;
  serviceId: string;
  baseUrl?: string;
  keywords: string[];
  enabled: boolean;
  manifest?: ProviderManifest;
};

type ProviderCallEndpoint = 'invoke' | 'interact';

type ProviderCallErrorCode =
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_REJECTED'
  | 'PROVIDER_AUTH_DENIED'
  | 'PROVIDER_INVALID_RESPONSE';

type ProviderCallError = {
  code: ProviderCallErrorCode;
  retryable: boolean;
  statusCode?: number;
  message: string;
};

type ProviderCircuitState = {
  openedAt?: number;
  failureWindowStartedAt?: number;
  failureCount: number;
  halfOpen: boolean;
};

type TaskThreadState = {
  taskId: string;
  sessionId: string;
  providerId: string;
  runId: string;
  state: TaskLifecycleState;
  executionPolicy: TaskExecutionPolicy;
  activeQuestionId?: string;
  activeReplyToken?: string;
  metadata?: Record<string, unknown>;
  updatedAt: number;
};

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
const taskThreadsBySession = new Map<string, Map<string, TaskThreadState>>();
const nonceReplay = new Map<string, number>();
const internalNonceStore = createMemoryNonceStore();
const persistence = new GatewayPersistence();
const logger = createLogger({ service: 'gateway' });
const observability = new GatewayObservability();
const providerCircuit = new Map<string, ProviderCircuitState>();
let manifestRefreshTimer: NodeJS.Timeout | undefined;

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

function parseProviderRegistryFromEnv(): ProviderRegistryEntry[] {
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

const providerRegistry = new Map<string, ProviderRegistryEntry>(
  parseProviderRegistryFromEnv().map((entry) => [entry.providerId, entry]),
);

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

  const scored = [...providerRegistry.values()]
    .filter((provider) => provider.enabled && Boolean(provider.baseUrl))
    .map((provider) => {
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

    if (session.stickyProviderId === provider.providerId) {
      score += session.stickyScoreBoost;
    }

    return {
      providerId: provider.providerId,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function providerAllowedSubjects(): string[] {
  const subjects = new Set<string>();
  providerRegistry.forEach((entry) => {
    if (entry.enabled && entry.serviceId) {
      subjects.add(entry.serviceId);
    }
  });
  return [...subjects];
}

function getProviderEntry(providerId: string): ProviderRegistryEntry | undefined {
  return providerRegistry.get(providerId);
}

function getTaskMap(sessionId: string): Map<string, TaskThreadState> {
  const existing = taskThreadsBySession.get(sessionId);
  if (existing) return existing;
  const created = new Map<string, TaskThreadState>();
  taskThreadsBySession.set(sessionId, created);
  return created;
}

async function ensureTaskThreadsLoaded(sessionId: string): Promise<void> {
  const existing = taskThreadsBySession.get(sessionId);
  if (existing || !persistence.isEnabled()) return;
  try {
    const loaded = await persistence.listTaskThreads(sessionId);
    const map = new Map<string, TaskThreadState>();
    loaded.forEach((thread) => {
      map.set(thread.taskId, {
        taskId: thread.taskId,
        sessionId: thread.sessionId,
        providerId: thread.providerId,
        runId: thread.runId,
        state: thread.state,
        executionPolicy: thread.executionPolicy,
        activeQuestionId: thread.activeQuestionId,
        activeReplyToken: thread.activeReplyToken,
        metadata: thread.metadata,
        updatedAt: thread.updatedAt || now(),
      });
    });
    taskThreadsBySession.set(sessionId, map);
  } catch (error) {
    observability.observePersistenceError();
    logger.error('persistence listTaskThreads failed', serializeError(error));
    taskThreadsBySession.set(sessionId, new Map<string, TaskThreadState>());
  }
}

function persistTaskThreadAsync(thread: TaskThreadState): void {
  if (!persistence.isEnabled()) return;
  const record: TaskThreadRecord = {
    taskId: thread.taskId,
    sessionId: thread.sessionId,
    providerId: thread.providerId,
    runId: thread.runId,
    state: thread.state,
    executionPolicy: thread.executionPolicy,
    activeQuestionId: thread.activeQuestionId,
    activeReplyToken: thread.activeReplyToken,
    metadata: thread.metadata,
    updatedAt: thread.updatedAt,
  };
  void persistence.saveTaskThread(record).catch((error: unknown) => {
    observability.observePersistenceError();
    logger.error('persistence saveTaskThread failed', serializeError(error));
  });
}

function listPendingTaskThreads(sessionId: string): TaskThreadState[] {
  const map = taskThreadsBySession.get(sessionId);
  if (!map) return [];
  return [...map.values()].filter((thread) => thread.state === 'collecting' && thread.activeReplyToken);
}

function findTaskThreadByReplyToken(sessionId: string, replyToken: string): TaskThreadState | undefined {
  const map = taskThreadsBySession.get(sessionId);
  if (!map) return undefined;
  return [...map.values()].find((thread) => thread.activeReplyToken === replyToken);
}

function normalizeProviderInteractionEvent(
  providerId: string,
  runId: string,
  event: InteractionEvent,
): InteractionEvent {
  if (event.type !== 'provider_extension') {
    return event;
  }

  if (event.extensionKind === 'data_collection_request') {
    const taskId = event.payload.taskId || runId;
    return {
      type: 'provider_extension',
      extensionKind: 'task_question',
      payload: {
        schemaVersion: 'v0',
        providerId: event.payload.providerId || providerId,
        runId,
        taskId,
        questionId: `${taskId}:q:legacy`,
        replyToken: uuid(),
        prompt: '请补充任务所需资料。',
        answerSchema: event.payload.dataSchema,
        uiSchema: event.payload.uiSchema,
        metadata: {
          legacyExtensionKind: 'data_collection_request',
          legacyStatus: event.payload.status,
        },
      },
    };
  }

  if (event.extensionKind === 'data_collection_progress') {
    return {
      type: 'provider_extension',
      extensionKind: 'task_state',
      payload: {
        schemaVersion: 'v0',
        providerId: event.payload.providerId || providerId,
        runId,
        taskId: event.payload.taskId || runId,
        state: 'collecting',
        executionPolicy: 'require_user_confirm',
        metadata: {
          legacyExtensionKind: 'data_collection_progress',
          progress: event.payload.progress,
          legacyStatus: event.payload.status,
        },
      },
    };
  }

  if (event.extensionKind === 'data_collection_result') {
    return {
      type: 'provider_extension',
      extensionKind: 'task_state',
      payload: {
        schemaVersion: 'v0',
        providerId: event.payload.providerId || providerId,
        runId,
        taskId: event.payload.taskId || runId,
        state: 'ready',
        executionPolicy: 'require_user_confirm',
        metadata: {
          legacyExtensionKind: 'data_collection_result',
          values: event.payload.values,
          dataSchema: event.payload.dataSchema,
          uiSchema: event.payload.uiSchema,
          legacyStatus: event.payload.status,
        },
      },
    };
  }

  if (event.extensionKind === 'task_question') {
    return {
      ...event,
      payload: {
        ...event.payload,
        providerId: event.payload.providerId || providerId,
        runId: event.payload.runId || runId,
      },
    };
  }

  if (event.extensionKind === 'task_state') {
    return {
      ...event,
      payload: {
        ...event.payload,
        providerId: event.payload.providerId || providerId,
        runId: event.payload.runId || runId,
      },
    };
  }

  return event;
}

async function refreshProviderManifest(provider: ProviderRegistryEntry): Promise<void> {
  if (!provider.baseUrl) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${provider.baseUrl}/.well-known/uniassist/manifest.json`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return;
    const manifest = (await response.json()) as ProviderManifest;
    provider.manifest = manifest;
  } catch {
    // best effort; keep static registry when manifest unavailable
  }
}

async function refreshAllProviderManifests(): Promise<void> {
  for (const provider of providerRegistry.values()) {
    if (!provider.enabled) continue;
    await refreshProviderManifest(provider);
  }
}

function circuitKey(providerId: string, endpoint: ProviderCallEndpoint): string {
  return `${providerId}:${endpoint}`;
}

function canCallProvider(providerId: string, endpoint: ProviderCallEndpoint): boolean {
  const key = circuitKey(providerId, endpoint);
  const state = providerCircuit.get(key);
  if (!state || !state.openedAt) return true;
  if (now() - state.openedAt >= PROVIDER_CIRCUIT_OPEN_MS) {
    state.openedAt = undefined;
    state.halfOpen = true;
    providerCircuit.set(key, state);
    return true;
  }
  return false;
}

function markProviderCallSuccess(providerId: string, endpoint: ProviderCallEndpoint): void {
  providerCircuit.set(circuitKey(providerId, endpoint), {
    failureCount: 0,
    failureWindowStartedAt: undefined,
    halfOpen: false,
    openedAt: undefined,
  });
}

function markProviderCallFailure(providerId: string, endpoint: ProviderCallEndpoint): void {
  const key = circuitKey(providerId, endpoint);
  const state = providerCircuit.get(key) || {
    failureCount: 0,
    halfOpen: false,
  };
  const current = now();
  if (!state.failureWindowStartedAt || current - state.failureWindowStartedAt > PROVIDER_CIRCUIT_WINDOW_MS) {
    state.failureWindowStartedAt = current;
    state.failureCount = 1;
  } else {
    state.failureCount += 1;
  }
  if (state.failureCount >= PROVIDER_CIRCUIT_OPEN_AFTER_FAILURES) {
    state.openedAt = current;
    state.halfOpen = false;
  }
  providerCircuit.set(key, state);
}

function mapProviderStatusError(statusCode: number): ProviderCallError {
  if (statusCode === 401 || statusCode === 403) {
    return {
      code: 'PROVIDER_AUTH_DENIED',
      retryable: false,
      statusCode,
      message: `provider auth denied: ${statusCode}`,
    };
  }
  if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
    return {
      code: 'PROVIDER_REJECTED',
      retryable: false,
      statusCode,
      message: `provider rejected request: ${statusCode}`,
    };
  }
  return {
    code: 'PROVIDER_UNAVAILABLE',
    retryable: true,
    statusCode,
    message: `provider unavailable: ${statusCode}`,
  };
}

async function callProviderEndpoint<TResponse>(
  provider: ProviderRegistryEntry,
  endpoint: ProviderCallEndpoint,
  requestBody: ProviderInvokeRequest | ProviderInteractRequest,
): Promise<TResponse> {
  if (!provider.baseUrl) {
    throw {
      code: 'PROVIDER_UNAVAILABLE',
      retryable: false,
      message: `${provider.providerId} baseUrl is not configured`,
    } satisfies ProviderCallError;
  }

  if (!canCallProvider(provider.providerId, endpoint)) {
    throw {
      code: 'PROVIDER_UNAVAILABLE',
      retryable: true,
      message: `${provider.providerId}:${endpoint} circuit is open`,
    } satisfies ProviderCallError;
  }

  const path = endpoint === 'invoke' ? '/v0/invoke' : '/v0/interact';
  const scopes = endpoint === 'invoke' ? ['provider:invoke'] : ['provider:interact'];

  let lastError: ProviderCallError | undefined;
  for (let attempt = 1; attempt <= PROVIDER_MAX_ATTEMPTS; attempt += 1) {
    const rawBody = JSON.stringify({
      ...requestBody,
      run: {
        ...requestBody.run,
        attempt,
      },
    });

    const internalHeaders = buildInternalAuthHeaders(INTERNAL_AUTH_CONFIG, {
      method: 'POST',
      path,
      rawBody,
      audience: provider.serviceId,
      scopes,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    try {
      const response = await fetch(`${provider.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: internalHeaders.authorization,
          'x-uniassist-internal-kid': internalHeaders['x-uniassist-internal-kid'],
          'x-uniassist-internal-ts': internalHeaders['x-uniassist-internal-ts'],
          'x-uniassist-internal-nonce': internalHeaders['x-uniassist-internal-nonce'],
          'x-uniassist-internal-signature': internalHeaders['x-uniassist-internal-signature'],
        },
        body: rawBody,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const mapped = mapProviderStatusError(response.status);
        lastError = mapped;
        if (!mapped.retryable) {
          markProviderCallFailure(provider.providerId, endpoint);
          throw mapped;
        }
        if (attempt < PROVIDER_MAX_ATTEMPTS) {
          const delay = (PROVIDER_RETRY_DELAYS_MS[attempt - 1] || 1200) + Math.floor(Math.random() * 100);
          await sleep(delay);
          continue;
        }
        markProviderCallFailure(provider.providerId, endpoint);
        throw mapped;
      }

      const payload = await response.json() as TResponse;
      markProviderCallSuccess(provider.providerId, endpoint);
      return payload;
    } catch (error) {
      clearTimeout(timeout);
      if ((error as { code?: string }).code) {
        throw error;
      }
      const mapped: ProviderCallError = (error as { name?: string }).name === 'AbortError'
        ? {
            code: 'PROVIDER_TIMEOUT',
            retryable: true,
            message: `${provider.providerId}:${endpoint} timeout`,
          }
        : {
            code: 'PROVIDER_UNAVAILABLE',
            retryable: true,
            message: `${provider.providerId}:${endpoint} network error`,
          };
      lastError = mapped;
      if (attempt < PROVIDER_MAX_ATTEMPTS && mapped.retryable) {
        const delay = (PROVIDER_RETRY_DELAYS_MS[attempt - 1] || 1200) + Math.floor(Math.random() * 100);
        await sleep(delay);
        continue;
      }
      markProviderCallFailure(provider.providerId, endpoint);
      throw mapped;
    }
  }

  throw lastError || {
    code: 'PROVIDER_UNAVAILABLE',
    retryable: true,
    message: `${provider.providerId}:${endpoint} failed`,
  };
}

async function invokeProvider(
  provider: ProviderRegistryEntry,
  input: UnifiedUserInput,
  context: ContextPackage,
  runId: string,
): Promise<InteractionEvent[]> {
  const requestBody: ProviderInvokeRequest = {
    schemaVersion: 'v0',
    input,
    context,
    run: {
      runId,
      providerId: provider.providerId,
      attempt: 1,
      idempotencyKey: `${input.traceId}:${provider.providerId}`,
    },
  };

  try {
    const payload = await callProviderEndpoint<ProviderInvokeResponse>(provider, 'invoke', requestBody);
    const events: InteractionEvent[] = [payload.ack, ...(payload.immediateEvents || [])];
    return events.map((event) => normalizeProviderInteractionEvent(provider.providerId, runId, event));
  } catch (error) {
    observability.observeProviderInvokeError();
    logger.warn('provider invoke fallback', {
      providerId: provider.providerId,
      ...(error && typeof error === 'object' ? error : { message: String(error) }),
    });
    return [
      {
        type: 'error',
        userMessage: `${provider.providerId} 专项暂时不可用，已切换为入口兜底处理。`,
        retryable: true,
      },
    ];
  }
}

async function interactProvider(
  provider: ProviderRegistryEntry,
  interaction: UserInteraction,
  context: ContextPackage,
): Promise<InteractionEvent[]> {
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
    const payload = await callProviderEndpoint<ProviderInteractResponse>(provider, 'interact', requestBody);
    return (payload.events || []).map((event) => normalizeProviderInteractionEvent(provider.providerId, interaction.runId, event));
  } catch (error) {
    observability.observeProviderInteractError();
    logger.warn('provider interact fallback', {
      providerId: provider.providerId,
      ...(error && typeof error === 'object' ? error : { message: String(error) }),
    });
    const fallbackEvents: InteractionEvent[] = [
      {
        type: 'error',
        userMessage: `${provider.providerId} 专项交互失败，入口将使用本地流程继续。`,
        retryable: true,
      },
    ];

    if (interaction.inReplyTo?.taskId) {
      fallbackEvents.push({
        type: 'provider_extension',
        extensionKind: 'task_state',
        payload: {
          schemaVersion: 'v0',
          providerId: provider.providerId,
          runId: interaction.runId,
          taskId: interaction.inReplyTo.taskId,
          state: 'failed',
          executionPolicy: 'require_user_confirm',
          metadata: {
            reason: 'provider_interact_failed',
          },
        },
      });
    }
    return fallbackEvents;
  }
}

function updateTaskThread(sessionId: string, thread: TaskThreadState): TaskThreadState {
  const map = getTaskMap(sessionId);
  const normalized: TaskThreadState = {
    ...thread,
    updatedAt: now(),
  };
  map.set(normalized.taskId, normalized);
  persistTaskThreadAsync(normalized);
  return normalized;
}

function buildTaskExecutionConfirmCard(thread: TaskThreadState): InteractionEvent {
  return {
    type: 'card',
    title: `任务已准备就绪（${thread.providerId}）`,
    body: `任务 ${thread.taskId} 已满足执行条件，是否开始执行？`,
    actions: [
      {
        actionId: `execute_task:${thread.taskId}`,
        label: '开始执行',
        style: 'primary',
      },
    ],
  };
}

async function emitProviderEvents(
  session: SessionState,
  input: UnifiedUserInput,
  providerId: string,
  runId: string,
  events: InteractionEvent[],
): Promise<void> {
  for (const event of events) {
    const normalized = normalizeProviderInteractionEvent(providerId, runId, event);
    emitEvent(session, input, 'interaction', {
      event: normalized,
      source: 'provider',
    }, providerId, runId);

    if (normalized.type !== 'provider_extension') continue;
    if (normalized.extensionKind === 'task_question') {
      const thread = updateTaskThread(session.sessionId, {
        taskId: normalized.payload.taskId,
        sessionId: session.sessionId,
        providerId: normalized.payload.providerId,
        runId: normalized.payload.runId,
        state: 'collecting',
        executionPolicy: 'require_user_confirm',
        activeQuestionId: normalized.payload.questionId,
        activeReplyToken: normalized.payload.replyToken,
        metadata: normalized.payload.metadata,
        updatedAt: now(),
      });
      void thread;
    }

    if (normalized.extensionKind === 'task_state') {
      const active = getTaskMap(session.sessionId).get(normalized.payload.taskId);
      const thread = updateTaskThread(session.sessionId, {
        taskId: normalized.payload.taskId,
        sessionId: session.sessionId,
        providerId: normalized.payload.providerId,
        runId: normalized.payload.runId,
        state: normalized.payload.state,
        executionPolicy: normalized.payload.executionPolicy,
        activeQuestionId: normalized.payload.state === 'collecting' ? active?.activeQuestionId : undefined,
        activeReplyToken: normalized.payload.state === 'collecting' ? active?.activeReplyToken : undefined,
        metadata: normalized.payload.metadata,
        updatedAt: now(),
      });

      if (thread.state === 'ready') {
        if (thread.executionPolicy === 'auto_execute') {
          const provider = getProviderEntry(thread.providerId);
          if (provider) {
            const executeInteraction: UserInteraction = {
              schemaVersion: 'v0',
              traceId: uuid(),
              sessionId: session.sessionId,
              userId: input.userId,
              providerId: thread.providerId,
              runId: thread.runId,
              actionId: 'execute_task',
              payload: { taskId: thread.taskId },
              inReplyTo: {
                providerId: thread.providerId,
                runId: thread.runId,
                taskId: thread.taskId,
              },
              timestampMs: now(),
            };
            const context = buildContextPackage(input, session);
            const executeEvents = await interactProvider(provider, executeInteraction, context);
            await emitProviderEvents(session, input, thread.providerId, thread.runId, executeEvents);
          }
        } else {
          emitEvent(session, input, 'interaction', {
            event: buildTaskExecutionConfirmCard(thread),
            source: 'system',
          }, thread.providerId, thread.runId);
        }
      }
    }
  }
}

function buildPendingTaskSelectionCard(threads: TaskThreadState[]): InteractionEvent {
  return {
    type: 'card',
    title: '检测到多个待回复任务',
    body: '请先选择你要继续的任务，避免消息分配错误。',
    actions: threads.map((thread) => ({
      actionId: `focus_task:${thread.taskId}`,
      label: `${thread.providerId} · ${thread.taskId}`,
      style: 'secondary',
      payload: {
        taskId: thread.taskId,
        providerId: thread.providerId,
        runId: thread.runId,
      },
    })),
  };
}

type InternalAuthGuardOptions = {
  endpoint: string;
  expectedAudience: string;
  requiredScopes?: string[];
  allowedSubjects?: string[];
  traceId?: string;
};

function buildAuthProblemDetail(
  code: InternalAuthDenyCode,
  status: 401 | 403,
  message: string,
): {
  type: string;
  title: string;
  status: 401 | 403;
  code: InternalAuthDenyCode;
  detail: string;
} {
  return {
    type: status === 403 ? 'https://uniassist/errors/forbidden' : 'https://uniassist/errors/unauthorized',
    title: status === 403 ? 'Forbidden' : 'Unauthorized',
    status,
    code,
    detail: message,
  };
}

function resolveTraceIdFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const obj = body as Record<string, unknown>;
  if (typeof obj.traceId === 'string') return obj.traceId;
  const input = obj.input as Record<string, unknown> | undefined;
  if (input && typeof input.traceId === 'string') return input.traceId;
  const interaction = obj.interaction as Record<string, unknown> | undefined;
  if (interaction && typeof interaction.traceId === 'string') return interaction.traceId;
  return undefined;
}

async function guardInternalAuth(
  req: RawBodyRequest,
  res: Response,
  options: InternalAuthGuardOptions,
): Promise<boolean> {
  if (INTERNAL_AUTH_CONFIG.mode === 'off') {
    observability.observeInternalAuthRequest(options.endpoint, 'off', 'pass');
    return true;
  }

  const verification = await verifyInternalAuthRequest({
    method: req.method,
    path: req.path,
    rawBody: req.rawBody || '',
    headers: req.headers as Record<string, string | string[] | undefined>,
    config: INTERNAL_AUTH_CONFIG,
    nonceStore: internalNonceStore,
    expectedAudience: options.expectedAudience,
    requiredScopes: options.requiredScopes,
    allowedSubjects: options.allowedSubjects,
  });

  if (verification.ok) {
    observability.observeInternalAuthRequest(options.endpoint, INTERNAL_AUTH_CONFIG.mode, 'pass');
    return true;
  }

  observability.observeInternalAuthDenied(options.endpoint, verification.code);
  if (verification.code === 'AUTH_REPLAY') {
    observability.observeInternalAuthReplay(options.endpoint);
  }

  const effectiveTraceId = options.traceId || resolveTraceIdFromBody(req.body);
  const deniedFields: Record<string, unknown> = {
    endpoint: options.endpoint,
    mode: INTERNAL_AUTH_CONFIG.mode,
    code: verification.code,
    detail: verification.message,
    traceId: effectiveTraceId,
    requiredScopes: options.requiredScopes,
    subject: verification.claims?.sub,
    audience: verification.claims?.aud,
  };
  logger.warn('internal auth denied', deniedFields);

  if (INTERNAL_AUTH_CONFIG.mode === 'audit') {
    observability.observeInternalAuthRequest(options.endpoint, 'audit', 'audit_allow');
    return true;
  }

  observability.observeInternalAuthRequest(options.endpoint, 'enforce', 'deny');
  const problem = buildAuthProblemDetail(verification.code, verification.status, verification.message);
  res.status(problem.status).json({
    schemaVersion: 'v0',
    ...problem,
    traceId: effectiveTraceId,
  });
  return false;
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
    const authorized = await guardInternalAuth(req, res, {
      endpoint: '/v0/ingest',
      expectedAudience: INTERNAL_AUTH_CONFIG.serviceId,
      allowedSubjects: ['adapter-wechat'],
      traceId: input.traceId,
    });
    if (!authorized) return;

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

  await ensureTaskThreadsLoaded(session.sessionId);
  emitEvent(session, effectiveInput, 'inbound', { input: effectiveInput });

  const pendingThreads = listPendingTaskThreads(session.sessionId);
  if (pendingThreads.length > 0 && effectiveInput.text?.trim()) {
    const contextPackage = buildContextPackage(effectiveInput, session);

    if (pendingThreads.length === 1) {
      const thread = pendingThreads[0];
      const provider = getProviderEntry(thread.providerId);
      const routing: RoutingDecision = {
        schemaVersion: 'v0',
        traceId: effectiveInput.traceId,
        sessionId: session.sessionId,
        candidates: [
          {
            providerId: thread.providerId,
            score: 1,
            reason: 'pending_task_reply',
            requiresClarification: false,
            suggestedMode: 'async',
          },
        ],
        requiresUserConfirmation: false,
        fallback: 'none',
        timestampMs: now(),
      };
      emitEvent(session, effectiveInput, 'routing_decision', routing as unknown as Record<string, unknown>);

      const runId = thread.runId;
      emitEvent(session, effectiveInput, 'provider_run', {
        providerId: thread.providerId,
        mode: 'async',
        score: 1,
        status: 'in-progress',
        routing_mode: 'normal',
        idempotency_key: `${effectiveInput.traceId}:${thread.providerId}:pending`,
        context: contextPackage,
      }, thread.providerId, runId);

      const forwarded: UserInteraction = {
        schemaVersion: 'v0',
        traceId: effectiveInput.traceId,
        sessionId: session.sessionId,
        userId: effectiveInput.userId,
        providerId: thread.providerId,
        runId,
        actionId: 'answer_task_question',
        replyToken: thread.activeReplyToken,
        inReplyTo: {
          providerId: thread.providerId,
          runId: thread.runId,
          taskId: thread.taskId,
          questionId: thread.activeQuestionId,
        },
        payload: {
          text: effectiveInput.text,
        },
        timestampMs: now(),
      };
      emitEvent(session, effectiveInput, 'user_interaction', forwarded as unknown as Record<string, unknown>, thread.providerId, runId);

      if (provider && provider.enabled && provider.baseUrl) {
        const providerEvents = await interactProvider(provider, forwarded, contextPackage);
        await emitProviderEvents(session, effectiveInput, thread.providerId, runId, providerEvents);
      } else {
        updateTaskThread(session.sessionId, {
          ...thread,
          state: 'failed',
          activeQuestionId: undefined,
          activeReplyToken: undefined,
          metadata: {
            ...(thread.metadata || {}),
            reason: 'provider_unavailable_or_unregistered',
          },
          updatedAt: now(),
        });
        emitEvent(session, effectiveInput, 'interaction', {
          event: {
            type: 'error',
            userMessage: `${thread.providerId} 未注册，无法继续该任务。`,
            retryable: false,
          },
          source: 'system',
        }, thread.providerId, runId);
      }

      persistSessionAsync(session);
      res.json({
        schemaVersion: 'v0',
        traceId: effectiveInput.traceId,
        sessionId: session.sessionId,
        userId: effectiveInput.userId,
        routing,
        runs: [{ providerId: thread.providerId, runId, mode: 'async' }],
        ackEvents: [{ type: 'ack', message: `已将你的回复转发到 ${thread.providerId} 任务。` }],
        stream: {
          type: 'sse',
          href: `/v0/stream?sessionId=${encodeURIComponent(session.sessionId)}&cursor=${session.seq}`,
          cursor: session.seq,
        },
        timestampMs: now(),
      } satisfies IngestAck);
      return;
    }

    const routing: RoutingDecision = {
      schemaVersion: 'v0',
      traceId: effectiveInput.traceId,
      sessionId: session.sessionId,
      candidates: pendingThreads.map((thread) => ({
        providerId: thread.providerId,
        score: 1,
        reason: `pending_task:${thread.taskId}`,
        requiresClarification: true,
        suggestedMode: 'async',
      })),
      requiresUserConfirmation: true,
      fallback: 'none',
      timestampMs: now(),
    };
    emitEvent(session, effectiveInput, 'routing_decision', routing as unknown as Record<string, unknown>);
    emitEvent(session, effectiveInput, 'interaction', {
      event: buildPendingTaskSelectionCard(pendingThreads),
      source: 'system',
    });
    persistSessionAsync(session);
    res.json({
      schemaVersion: 'v0',
      traceId: effectiveInput.traceId,
      sessionId: session.sessionId,
      userId: effectiveInput.userId,
      routing,
      runs: [],
      ackEvents: [{ type: 'ack', message: '当前存在多个待处理任务，请先选择要继续的任务。' }],
      stream: {
        type: 'sse',
        href: `/v0/stream?sessionId=${encodeURIComponent(session.sessionId)}&cursor=${session.seq}`,
        cursor: session.seq,
      },
      timestampMs: now(),
    } satisfies IngestAck);
    return;
  }

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

      const provider = getProviderEntry(candidate.providerId);
      if (!provider || !provider.enabled || !provider.baseUrl) {
        const msg: InteractionEvent = {
          type: 'assistant_message',
          text: `${candidate.providerId} 专项未注册，入口将先行承接。`,
        };
        emitEvent(session, effectiveInput, 'interaction', { event: msg, source: 'system' }, candidate.providerId, runId);
        continue;
      }

      void (async () => {
        const providerEvents = await invokeProvider(provider, effectiveInput, contextPackage, runId);
        await emitProviderEvents(session, effectiveInput, candidate.providerId, runId, providerEvents);
      })();
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
  const requestInteraction = req.body as UserInteraction;
  if (!requestInteraction || requestInteraction.schemaVersion !== 'v0') {
    res.status(400).json({ accepted: false, reason: 'invalid interaction' });
    return;
  }

  let session = sessions.get(requestInteraction.sessionId);
  if (!session && persistence.isEnabled()) {
    const persisted = await persistence.loadSession(requestInteraction.sessionId);
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
    traceId: requestInteraction.traceId,
    userId: requestInteraction.userId,
    sessionId: requestInteraction.sessionId,
    source: 'app',
    timestampMs: now(),
  };

  await ensureTaskThreadsLoaded(session.sessionId);
  let interaction: UserInteraction = { ...requestInteraction };

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

  if (interaction.actionId.startsWith('focus_task:')) {
    const taskId = interaction.actionId.replace('focus_task:', '');
    const thread = getTaskMap(session.sessionId).get(taskId);
    if (!thread) {
      res.status(404).json({ accepted: false, reason: 'task not found' });
      return;
    }
    emitEvent(session, inputRef, 'interaction', {
      event: {
        type: 'assistant_message',
        text: `已聚焦任务 ${taskId}（${thread.providerId}），你可直接继续回复。`,
      },
      source: 'system',
    }, thread.providerId, thread.runId);
    res.json({
      accepted: true,
      focusedTask: {
        taskId: thread.taskId,
        providerId: thread.providerId,
        runId: thread.runId,
        replyToken: thread.activeReplyToken,
      },
    });
    return;
  }

  const taskMap = getTaskMap(session.sessionId);
  let thread: TaskThreadState | undefined;

  if (interaction.replyToken) {
    thread = findTaskThreadByReplyToken(session.sessionId, interaction.replyToken);
  }

  if (!thread && interaction.inReplyTo?.taskId) {
    thread = taskMap.get(interaction.inReplyTo.taskId);
  }

  if (!thread && interaction.actionId.startsWith('execute_task:')) {
    const taskId = interaction.actionId.replace('execute_task:', '');
    thread = taskMap.get(taskId);
  }

  if (
    !thread
    && (
      interaction.actionId.startsWith('submit_data_collection')
      || interaction.actionId.startsWith('answer_task_question')
      || interaction.actionId.startsWith('execute_task')
    )
  ) {
    const pending = listPendingTaskThreads(session.sessionId);
    if (pending.length === 1) {
      thread = pending[0];
    } else if (pending.length > 1) {
      emitEvent(session, inputRef, 'interaction', {
        event: buildPendingTaskSelectionCard(pending),
        source: 'system',
      });
      persistSessionAsync(session);
      res.json({ accepted: true, reason: 'multiple_pending_tasks' });
      return;
    }
  }

  if (thread) {
    interaction = {
      ...interaction,
      providerId: thread.providerId,
      runId: thread.runId,
      replyToken: interaction.replyToken || thread.activeReplyToken,
      inReplyTo: {
        providerId: thread.providerId,
        runId: thread.runId,
        taskId: thread.taskId,
        questionId: thread.activeQuestionId,
      },
    };
  }

  if (
    interaction.actionId.startsWith('submit_data_collection')
    || interaction.actionId.startsWith('answer_task_question')
    || interaction.actionId.startsWith('execute_task')
  ) {
    const contextPackage = buildContextPackage(inputRef, session);
    const provider = getProviderEntry(interaction.providerId);

    if (provider && provider.enabled && provider.baseUrl) {
      const providerEvents = await interactProvider(provider, interaction, contextPackage);
      await emitProviderEvents(session, inputRef, interaction.providerId, interaction.runId, providerEvents);
    } else {
      if (thread) {
        updateTaskThread(session.sessionId, {
          ...thread,
          state: 'failed',
          activeQuestionId: undefined,
          activeReplyToken: undefined,
          metadata: {
            ...(thread.metadata || {}),
            reason: 'provider_unavailable_or_unregistered',
          },
          updatedAt: now(),
        });
      }
      emitEvent(session, inputRef, 'interaction', {
        event: {
          type: 'error',
          userMessage: `${interaction.providerId} 未注册，无法处理当前动作。`,
          retryable: false,
        },
        source: 'system',
      }, interaction.providerId, interaction.runId);
    }
  }

  persistSessionAsync(session);
  res.json({ accepted: true });
});

app.post('/v0/events', async (req: RawBodyRequest, res) => {
  try {
    const allowedSubjects = providerAllowedSubjects();
    const authorized = await guardInternalAuth(req, res, {
      endpoint: '/v0/events',
      expectedAudience: INTERNAL_AUTH_CONFIG.serviceId,
      requiredScopes: ['events:write'],
      allowedSubjects,
    });
    if (!authorized) return;

    const body = req.body as ProviderEventsRequest;
    if (!body || body.schemaVersion !== 'v0' || !Array.isArray(body.events)) {
      res.status(400).json({ schemaVersion: 'v0', accepted: 0, rejected: 1, errors: [{ index: 0, code: 'INVALID_REQUEST', message: 'invalid payload' }] });
      return;
    }

    let accepted = 0;
    let rejected = 0;
    const errors: Array<{ index: number; code: string; message: string }> = [];

    for (let index = 0; index < body.events.length; index += 1) {
      const item = body.events[index];
      try {
        if (item.kind === 'interaction' || item.kind === 'task_state') {
          let session = sessions.get(item.sessionId);
          if (!session && persistence.isEnabled()) {
            const persisted = await persistence.loadSession(item.sessionId);
            if (persisted) {
              session = persisted;
              sessions.set(session.sessionId, session);
            }
          }
          if (!session) {
            throw new Error('session_not_found');
          }
          await ensureTaskThreadsLoaded(item.sessionId);

          const inputRef: UnifiedUserInput = {
            schemaVersion: 'v0',
            traceId: item.traceId,
            userId: item.userId,
            sessionId: item.sessionId,
            source: 'api',
            timestampMs: item.timestampMs,
          };
          const event = item.kind === 'interaction'
            ? item.event
            : item.event;
          await emitProviderEvents(
            session,
            inputRef,
            body.providerId,
            item.runId,
            [event as InteractionEvent],
          );
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
    }

    res.json({ schemaVersion: 'v0', accepted, rejected, errors: errors.length ? errors : undefined });
  } catch (error) {
    logger.error('events handler failed', serializeError(error));
    res.status(500).json({
      schemaVersion: 'v0',
      type: 'https://uniassist/errors/internal',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_ERROR',
      detail: 'unexpected server error',
    });
  }
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
  const authorized = await guardInternalAuth(req as RawBodyRequest, res, {
    endpoint: '/v0/context/users/:profileRef',
    expectedAudience: INTERNAL_AUTH_CONFIG.serviceId,
    requiredScopes: ['context:read'],
    allowedSubjects: providerAllowedSubjects(),
  });
  if (!authorized) return;

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
  if (INTERNAL_AUTH_CONFIG.replayBackend === 'redis') {
    logger.warn('internal auth replay backend requested redis but gateway currently uses in-memory nonce store', {
      requestedReplayBackend: INTERNAL_AUTH_CONFIG.replayBackend,
    });
  }
  await refreshAllProviderManifests();
  manifestRefreshTimer = setInterval(() => {
    void refreshAllProviderManifests();
  }, 5 * 60 * 1000);
  logger.info('gateway listening', { port: PORT });
});

async function shutdown(): Promise<void> {
  if (manifestRefreshTimer) {
    clearInterval(manifestRefreshTimer);
    manifestRefreshTimer = undefined;
  }
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
