import type { Express } from 'express';

import type { GatewayServiceBundle } from '../gateway-services';
import type { RawBodyRequest } from '../gateway-types';

export function registerTimelineAndContextRoutes(app: Express, services: GatewayServiceBundle): void {
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

    const seed = await services.timelineService.listTimelineEvents(sessionId, cursor);
    for (const event of seed) {
      res.write(`data: ${JSON.stringify({ schemaVersion: 'v0', type: 'timeline_event', event })}\n\n`);
    }

    const unsubscribe = services.timelineService.addSseClient(sessionId, res);
    req.on('close', unsubscribe);
  });

  app.get('/v0/timeline', async (req, res) => {
    const sessionId = String(req.query.sessionId || '');
    const cursor = Number(req.query.cursor || 0);

    if (!sessionId) {
      res.status(400).json({ events: [], nextCursor: cursor });
      return;
    }

    const events = await services.timelineService.listTimelineEvents(sessionId, cursor);
    const nextCursor = events.length > 0 ? events[events.length - 1].seq : cursor;
    res.json({ schemaVersion: 'v0', events, nextCursor });
  });

  app.get('/v0/context/users/:profileRef', async (req, res) => {
    const authorized = await services.authGuards.guardInternalAuth(req as RawBodyRequest, res, {
      endpoint: '/v0/context/users/:profileRef',
      expectedAudience: services.internalAuthServiceId,
      requiredScopes: ['context:read'],
      allowedSubjects: services.providerClient.providerAllowedSubjects(),
    });
    if (!authorized) return;

    const profileRef = req.params.profileRef;
    const context = await services.userContextService.loadOrGenerate(profileRef);
    res.json(context);
  });
}
