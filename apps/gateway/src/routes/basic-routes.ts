import type { Express } from 'express';

import type { GatewayServiceBundle } from '../gateway-services';

export function registerBasicRoutes(app: Express, services: GatewayServiceBundle): void {
  const loadOutboxMetricsSnapshot = async () => {
    if (!services.persistence.isEnabled()) return null;
    try {
      return await services.persistence.getOutboxMetricsSnapshot();
    } catch (error) {
      services.observability.observePersistenceError();
      services.logger.error('persistence getOutboxMetricsSnapshot failed', services.serializeError(error));
      return null;
    }
  };

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'gateway',
      version: '0.1.0',
      persistence: {
        enabled: services.persistence.isEnabled(),
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
      timestampMs: services.now(),
      metrics: services.observability.snapshot(outbox),
    });
  });

  app.get('/metrics', async (_req, res) => {
    const outbox = await loadOutboxMetricsSnapshot();
    res.type('text/plain');
    res.send(services.observability.toPrometheus(outbox));
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
}
