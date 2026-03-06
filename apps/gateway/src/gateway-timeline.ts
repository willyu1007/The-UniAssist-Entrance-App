import type { Response } from 'express';

import type { IngestAck, TimelineEvent, UnifiedUserInput } from '@baseinterface/contracts';
import type { GatewayObservability } from './observability';
import type { GatewayPersistence } from './persistence';
import type { SessionState } from './gateway-types';

type LoggerLike = {
  error: (msg: string, fields?: Record<string, unknown>) => void;
};

type TimelineDeps = {
  persistence: GatewayPersistence;
  observability: GatewayObservability;
  logger: LoggerLike;
  now: () => number;
  uuid: () => string;
  serializeError: (error: unknown) => Record<string, unknown>;
};

export type TimelineService = {
  emitEvent: (
    session: SessionState,
    input: UnifiedUserInput,
    kind: TimelineEvent['kind'],
    payload: Record<string, unknown>,
    providerId?: string,
    runId?: string,
  ) => TimelineEvent;
  listTimelineEvents: (sessionId: string, cursor: number) => Promise<TimelineEvent[]>;
  addSseClient: (sessionId: string, res: Response) => () => void;
};

function mergeTimelineEvents(inMemory: TimelineEvent[], persisted: TimelineEvent[]): TimelineEvent[] {
  const merged = new Map<string, TimelineEvent>();
  for (const event of [...persisted, ...inMemory]) {
    merged.set(event.eventId, event);
  }
  return [...merged.values()].sort((a, b) => a.seq - b.seq);
}

export function createTimelineService(deps: TimelineDeps): TimelineService {
  const timelineBySession = new Map<string, TimelineEvent[]>();
  const sseClients = new Map<string, Set<Response>>();

  const nextSeq = (session: SessionState): number => {
    session.seq += 1;
    return session.seq;
  };

  const pushTimelineEvent = (event: TimelineEvent): void => {
    const list = timelineBySession.get(event.sessionId) || [];
    list.push(event);
    timelineBySession.set(event.sessionId, list);

    if (deps.persistence.isEnabled()) {
      void deps.persistence.saveTimelineEvent(event).catch((error: unknown) => {
        deps.observability.observePersistenceError();
        deps.logger.error('persistence saveTimelineEvent failed', deps.serializeError(error));
      });
    }

    const clients = sseClients.get(event.sessionId);
    if (!clients) return;

    const payload = JSON.stringify({ schemaVersion: 'v0', type: 'timeline_event', event });
    for (const client of clients) {
      client.write(`data: ${payload}\n\n`);
    }
  };

  const emitEvent: TimelineService['emitEvent'] = (session, input, kind, payload, providerId, runId) => {
    let extensionKind: TimelineEvent['extensionKind'];
    let renderSchemaRef: TimelineEvent['renderSchemaRef'];

    if (kind === 'interaction') {
      const maybeEvent = payload.event as {
        type?: string;
        extensionKind?: TimelineEvent['extensionKind'];
        payload?: { providerId?: string };
      } | undefined;
      if (maybeEvent?.type === 'provider_extension' && maybeEvent.extensionKind) {
        extensionKind = maybeEvent.extensionKind;
        if (maybeEvent.payload?.providerId) {
          renderSchemaRef = `v0:${maybeEvent.payload.providerId}:${maybeEvent.extensionKind}`;
        }
      }
    }

    const event: TimelineEvent = {
      schemaVersion: 'v0',
      eventId: deps.uuid(),
      traceId: input.traceId,
      sessionId: session.sessionId,
      userId: input.userId,
      providerId,
      runId,
      seq: nextSeq(session),
      timestampMs: deps.now(),
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

      if (deps.persistence.isEnabled()) {
        void deps.persistence.saveProviderRun({
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
          deps.observability.observePersistenceError();
          deps.logger.error('persistence saveProviderRun failed', deps.serializeError(error));
        });
      }
    }

    return event;
  };

  const listTimelineEvents: TimelineService['listTimelineEvents'] = async (sessionId, cursor) => {
    const inMemory = (timelineBySession.get(sessionId) || []).filter((event) => event.seq > cursor);
    if (!deps.persistence.isEnabled()) {
      return inMemory;
    }

    try {
      const persisted = await deps.persistence.listTimelineEvents(sessionId, cursor);
      return mergeTimelineEvents(inMemory, persisted);
    } catch (error) {
      deps.observability.observePersistenceError();
      deps.logger.error('persistence listTimelineEvents failed', deps.serializeError(error));
      return inMemory;
    }
  };

  const addSseClient: TimelineService['addSseClient'] = (sessionId, res) => {
    const clients = sseClients.get(sessionId) || new Set<Response>();
    clients.add(res);
    sseClients.set(sessionId, clients);

    return () => {
      clients.delete(res);
      if (clients.size === 0) sseClients.delete(sessionId);
    };
  };

  return {
    emitEvent,
    listTimelineEvents,
    addSseClient,
  };
}

export type IngestRuns = IngestAck['runs'];
