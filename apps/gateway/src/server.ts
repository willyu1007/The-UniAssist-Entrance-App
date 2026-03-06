import type { Request } from 'express';
import express from 'express';
import cors from 'cors';

import {
  createLogger,
  createMemoryNonceStore,
  serializeError,
} from '@baseinterface/shared';

import {
  ADAPTER_SECRET,
  INTERNAL_AUTH_CONFIG,
  PORT,
  now,
  parseProviderRegistryFromEnv,
  uuid,
} from './gateway-config';
import { createAuthGuards } from './gateway-auth';
import { createProviderClient } from './gateway-provider-client';
import { createEmitProviderEvents } from './gateway-provider-events';
import { createSessionService } from './gateway-sessions';
import type { GatewayServiceBundle } from './gateway-services';
import { createTaskThreadService } from './gateway-task-threads';
import { createTimelineService } from './gateway-timeline';
import type { RawBodyRequest } from './gateway-types';
import { createUserContextService } from './gateway-user-context';
import { GatewayObservability } from './observability';
import { GatewayPersistence } from './persistence';
import { registerBasicRoutes } from './routes/basic-routes';
import { registerEventsRoute } from './routes/events-route';
import { registerIngestRoute } from './routes/ingest-route';
import { registerInteractRoute } from './routes/interact-route';
import { registerTimelineAndContextRoutes } from './routes/timeline-context-routes';

const logger = createLogger({ service: 'gateway' });
const persistence = new GatewayPersistence();
const observability = new GatewayObservability();
const nonceReplay = new Map<string, number>();
const internalNonceStore = createMemoryNonceStore();

const providerRegistry = new Map(
  parseProviderRegistryFromEnv().map((entry) => [entry.providerId, entry]),
);

const sessionService = createSessionService({
  persistence,
  observability,
  logger,
  now,
  uuid,
  serializeError,
});

const taskThreadService = createTaskThreadService({
  persistence,
  observability,
  logger,
  now,
  uuid,
  serializeError,
});

const timelineService = createTimelineService({
  persistence,
  observability,
  logger,
  now,
  uuid,
  serializeError,
});

const providerClient = createProviderClient({
  providerRegistry,
  internalAuthConfig: INTERNAL_AUTH_CONFIG,
  now,
  observability,
  logger,
  normalizeProviderInteractionEvent: taskThreadService.normalizeProviderInteractionEvent,
});

const authGuards = createAuthGuards({
  internalAuthConfig: INTERNAL_AUTH_CONFIG,
  internalNonceStore,
  nonceReplay,
  adapterSecret: ADAPTER_SECRET,
  now,
  observability,
  logger,
});

const userContextService = createUserContextService({
  persistence,
  observability,
  logger,
  now,
  serializeError,
});

const services: GatewayServiceBundle = {
  persistence,
  observability,
  logger,
  serializeError,
  internalAuthServiceId: INTERNAL_AUTH_CONFIG.serviceId,
  sessionService,
  timelineService,
  taskThreadService,
  providerClient,
  authGuards,
  userContextService,
  now,
  uuid,
};

const emitProviderEvents = createEmitProviderEvents(services);

const app = express();
app.use(cors());
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as RawBodyRequest).rawBody = buf.toString('utf8');
  },
}));

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

app.use('/v0/ingest', (_req: Request, res, next) => {
  const startedAt = now();
  res.on('finish', () => {
    observability.observeIngest(res.statusCode, now() - startedAt);
  });
  next();
});

registerBasicRoutes(app, services);
registerIngestRoute(app, services, providerRegistry, emitProviderEvents);
registerInteractRoute(app, services, emitProviderEvents);
registerEventsRoute(app, services, emitProviderEvents);
registerTimelineAndContextRoutes(app, services);

let manifestRefreshTimer: NodeJS.Timeout | undefined;
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
  await providerClient.refreshAllProviderManifests();
  manifestRefreshTimer = setInterval(() => {
    void providerClient.refreshAllProviderManifests();
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
