import type { Express } from 'express';

import type {
  DomainEvent,
  InteractionEvent,
  ProviderEventsRequest,
  UnifiedUserInput,
} from '@baseinterface/contracts';

import { STICKY_DEFAULT_BOOST } from '../gateway-config';
import type { GatewayServiceBundle } from '../gateway-services';
import type { RawBodyRequest } from '../gateway-types';

export function registerEventsRoute(
  app: Express,
  services: GatewayServiceBundle,
  emitProviderEvents: (
    session: Awaited<ReturnType<GatewayServiceBundle['sessionService']['getOrCreateSession']>>['session'],
    input: UnifiedUserInput,
    providerId: string,
    runId: string,
    events: InteractionEvent[],
  ) => Promise<void>,
): void {
  app.post('/v0/events', async (req: RawBodyRequest, res) => {
    try {
      const allowedSubjects = services.providerClient.providerAllowedSubjects();
      const authorized = await services.authGuards.guardInternalAuth(req, res, {
        endpoint: '/v0/events',
        expectedAudience: services.internalAuthServiceId,
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
            let session = await services.sessionService.loadSession(item.sessionId);
            if (!session) {
              throw new Error('session_not_found');
            }
            await services.taskThreadService.ensureTaskThreadsLoaded(item.sessionId);

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
            const sessionId = event.sessionId || services.uuid();
            const loaded = await services.sessionService.loadSession(sessionId);
            const session = loaded || services.sessionService.ensureSession({
              sessionId,
              userId: event.userId,
              seq: 0,
              lastActivityAt: services.now(),
              topicDriftStreak: 0,
              stickyScoreBoost: STICKY_DEFAULT_BOOST,
              switchLeadStreak: 0,
            });

            services.sessionService.persistSessionAsync(session);

            const inputRef: UnifiedUserInput = {
              schemaVersion: 'v0',
              traceId: event.traceId || services.uuid(),
              userId: event.userId,
              sessionId,
              source: 'api',
              timestampMs: event.timestampMs,
            };

            services.timelineService.emitEvent(session, inputRef, 'domain_event', { event }, body.providerId);
          }

          accepted += 1;
        } catch (error) {
          rejected += 1;
          errors.push({ index, code: 'EVENT_REJECTED', message: String(error) });
        }
      }

      res.json({ schemaVersion: 'v0', accepted, rejected, errors: errors.length ? errors : undefined });
    } catch (error) {
      services.logger.error('events handler failed', services.serializeError(error));
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
}
