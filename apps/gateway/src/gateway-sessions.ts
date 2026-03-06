import type { UnifiedUserInput } from '@baseinterface/contracts';

import { SESSION_IDLE_MS, STICKY_DEFAULT_BOOST } from './gateway-config';
import type { GatewayObservability } from './observability';
import type { GatewayPersistence } from './persistence';
import type { SessionState } from './gateway-types';

type LoggerLike = {
  error: (msg: string, fields?: Record<string, unknown>) => void;
};

type SessionServiceDeps = {
  persistence: GatewayPersistence;
  observability: GatewayObservability;
  logger: LoggerLike;
  now: () => number;
  uuid: () => string;
  serializeError: (error: unknown) => Record<string, unknown>;
};

export type SessionService = {
  getOrCreateSession: (input: UnifiedUserInput) => Promise<{ session: SessionState; rotated: boolean }>;
  loadSession: (sessionId: string) => Promise<SessionState | undefined>;
  ensureSession: (session: SessionState) => SessionState;
  persistSessionAsync: (session: SessionState) => void;
};

export function createSessionService(deps: SessionServiceDeps): SessionService {
  const sessions = new Map<string, SessionState>();

  const persistSessionAsync: SessionService['persistSessionAsync'] = (session) => {
    if (!deps.persistence.isEnabled()) return;
    void deps.persistence.saveSession(session).catch((error: unknown) => {
      deps.observability.observePersistenceError();
      deps.logger.error('persistence saveSession failed', deps.serializeError(error));
    });
  };

  const loadSession = async (sessionId: string): Promise<SessionState | undefined> => {
    let session = sessions.get(sessionId);
    if (session) return session;

    if (!deps.persistence.isEnabled()) {
      return undefined;
    }

    const persisted = await deps.persistence.loadSession(sessionId);
    if (persisted) {
      session = persisted;
      sessions.set(session.sessionId, session);
      return session;
    }

    return undefined;
  };

  const getOrCreateSession: SessionService['getOrCreateSession'] = async (input) => {
    let existing = await loadSession(input.sessionId);

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
        sessionId: deps.uuid(),
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
  };

  const ensureSession = (session: SessionState): SessionState => {
    sessions.set(session.sessionId, session);
    return session;
  };

  return {
    getOrCreateSession,
    loadSession,
    ensureSession,
    persistSessionAsync,
  };
}

export function buildNewSessionState(
  sessionId: string,
  userId: string,
  now: number,
): SessionState {
  return {
    sessionId,
    userId,
    seq: 0,
    lastActivityAt: now,
    topicDriftStreak: 0,
    stickyScoreBoost: STICKY_DEFAULT_BOOST,
    switchLeadStreak: 0,
  };
}
