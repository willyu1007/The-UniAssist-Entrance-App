import type { Express } from 'express';

import type { UnifiedUserInput } from '@baseinterface/contracts';
import type { WorkflowEventProjectionRequest } from '@baseinterface/workflow-contracts';
import type { EmitProviderEvents, GatewayServiceBundle } from '../gateway-services';
import { translateWorkflowFormalEvents } from '../gateway-workflow-events';
import type { RawBodyRequest } from '../gateway-types';

export function registerWorkflowEventsRoute(
  app: Express,
  services: GatewayServiceBundle,
  emitProviderEvents: EmitProviderEvents,
): void {
  app.post('/internal/workflow-events', async (req: RawBodyRequest, res) => {
    const body = req.body as WorkflowEventProjectionRequest;
    const authorized = await services.authGuards.guardInternalAuth(req, res, {
      endpoint: '/internal/workflow-events',
      expectedAudience: services.internalAuthServiceId,
      requiredScopes: ['events:write'],
      allowedSubjects: ['workflow-platform-api', 'worker'],
      traceId: body?.traceId,
    });
    if (!authorized) return;

    const inputRef: UnifiedUserInput = {
      schemaVersion: 'v0',
      traceId: body.traceId,
      userId: body.userId,
      sessionId: body.sessionId,
      source: 'api',
      timestampMs: services.now(),
    };
    const { session } = await services.sessionService.getOrCreateSession(inputRef);
    await services.taskThreadService.ensureTaskThreadsLoaded(session.sessionId);

    const translated = translateWorkflowFormalEvents(body.compatProviderId, body.runId, body.events);
    await emitProviderEvents(session, inputRef, body.compatProviderId, body.runId, translated);
    services.sessionService.persistSessionAsync(session);
    res.json({ accepted: true });
  });
}
