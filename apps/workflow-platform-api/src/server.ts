import express from 'express';

import { createLogger } from '@baseinterface/shared';
import {
  DATABASE_URL,
  INTERNAL_AUTH_CONFIG,
  PORT,
  WORKFLOW_RUNTIME_BASE_URL,
  WORKFLOW_RUNTIME_SERVICE_ID,
  now,
  uuid,
} from './config';
import { ControlConsoleStreamBroker } from './control-console-stream';
import { createPlatformController } from './platform-controller';
import { createPlatformRepository } from './platform-repository';
import { createPlatformService } from './platform-service';
import { RuntimeClient } from './runtime-client';

const logger = createLogger({ service: 'workflow-platform-api' });

const repository = createPlatformRepository(DATABASE_URL || undefined);
const runtimeClient = new RuntimeClient({
  baseUrl: WORKFLOW_RUNTIME_BASE_URL,
  internalAuthConfig: INTERNAL_AUTH_CONFIG,
  runtimeServiceId: WORKFLOW_RUNTIME_SERVICE_ID,
});
const service = createPlatformService({
  repository,
  runtimeClient,
  now,
  uuid,
});
const controlConsoleBroker = new ControlConsoleStreamBroker();
const controller = createPlatformController(service, controlConsoleBroker);

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

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

app.get('/health', controller.health);

app.post('/v1/workflows', controller.directCreateRemoved);
app.get('/v1/workflows', controller.listWorkflows);
app.get('/v1/workflows/:workflowId', controller.getWorkflow);

app.post('/v1/workflow-drafts', controller.createDraft);
app.get('/v1/workflow-drafts', controller.listDrafts);
app.get('/v1/workflow-drafts/:draftId', controller.getDraft);
app.get('/v1/workflow-drafts/:draftId/revisions', controller.listDraftRevisions);
app.post('/v1/workflow-drafts/:draftId/focus', controller.focusDraft);
app.post('/v1/workflow-drafts/:draftId/intake', controller.intakeDraft);
app.post('/v1/workflow-drafts/:draftId/synthesize', controller.synthesizeDraft);
app.post('/v1/workflow-drafts/:draftId/validate', controller.validateDraft);
app.post('/v1/workflow-drafts/:draftId/publish', controller.publishDraft);

app.get('/v1/control-console/stream', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(': connected\n\n');

  const unsubscribe = controlConsoleBroker.subscribe((event) => {
    res.write(`data: ${JSON.stringify({ schemaVersion: 'v1', type: 'control_console_event', event })}\n\n`);
  });
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ schemaVersion: 'v1', type: 'heartbeat', timestampMs: now() })}\n\n`);
  }, 15_000);

  res.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

app.post('/v1/recipe-drafts', controller.createRecipeDraft);
app.get('/v1/recipe-drafts', controller.listRecipeDrafts);
app.get('/v1/recipe-drafts/:recipeDraftId', controller.getRecipeDraft);
app.patch('/v1/recipe-drafts/:recipeDraftId', controller.updateRecipeDraft);

app.post('/v1/runs', controller.startRun);
app.get('/v1/runs', controller.listRuns);
app.get('/v1/runs/:runId', controller.getRun);
app.post('/v1/runs/:runId/resume', controller.resumeRun);
app.get('/v1/approvals', controller.listApprovals);
app.get('/v1/approvals/queue', controller.listApprovalQueue);
app.get('/v1/approvals/:approvalRequestId', controller.getApprovalDetail);
app.post('/v1/approvals/:approvalRequestId/decision', controller.decideApproval);
app.get('/v1/artifacts/:artifactId', controller.getArtifact);
app.patch('/v1/workflow-drafts/:draftId/spec', controller.patchDraftSpec);

const server = app.listen(PORT, () => {
  logger.info('workflow platform api listening', {
    port: PORT,
    persistence: DATABASE_URL ? 'postgres' : 'memory',
  });
});

async function shutdown(): Promise<void> {
  await service.close().catch(() => undefined);
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
