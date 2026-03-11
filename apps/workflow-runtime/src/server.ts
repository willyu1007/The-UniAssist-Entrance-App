import type { Request, Response } from 'express';
import express from 'express';

import { createMemoryNonceStore, createLogger, verifyInternalAuthRequest } from '@baseinterface/shared';
import { createCompatExecutorClient } from '@baseinterface/executor-sdk';
import type {
  WorkflowRuntimeResumeRunRequest,
  WorkflowRuntimeStartRunRequest,
} from '@baseinterface/workflow-contracts';
import { DATABASE_URL, EXECUTOR_REGISTRY, INTERNAL_AUTH_CONFIG, PORT, now, uuid } from './config';
import { createWorkflowRuntimeService } from './service';
import { RuntimeStore } from './store';

type RawBodyRequest = Request & { rawBody?: string };

const logger = createLogger({ service: 'workflow-runtime' });
const internalNonceStore = createMemoryNonceStore();
const app = express();

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

const runtimeService = createWorkflowRuntimeService({
  store: new RuntimeStore(),
  compatExecutorClient: createCompatExecutorClient({
    internalAuthConfig: INTERNAL_AUTH_CONFIG,
    executorRegistry: EXECUTOR_REGISTRY,
  }),
  databaseUrl: DATABASE_URL || undefined,
  now,
  uuid,
});

async function guardInternalAuth(
  req: RawBodyRequest,
  res: Response,
  expectedAudience: string,
): Promise<boolean> {
  if (INTERNAL_AUTH_CONFIG.mode === 'off') return true;
  const verification = await verifyInternalAuthRequest({
    method: req.method,
    path: req.path,
    rawBody: req.rawBody || '',
    headers: req.headers as Record<string, string | string[] | undefined>,
    config: INTERNAL_AUTH_CONFIG,
    nonceStore: internalNonceStore,
    expectedAudience,
    allowedSubjects: ['workflow-platform-api'],
  });

  if (verification.ok || INTERNAL_AUTH_CONFIG.mode === 'audit') return true;
  res.status(verification.status).json({
    schemaVersion: 'v0',
    code: verification.code,
    detail: verification.message,
  });
  return false;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'workflow-runtime' });
});

app.post('/internal/runtime/start-run', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId);
  if (!authorized) return;
  try {
    const payload = req.body as WorkflowRuntimeStartRunRequest;
    const response = await runtimeService.startRun(payload);
    res.json(response);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/internal/runtime/resume-run', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId);
  if (!authorized) return;
  try {
    const payload = req.body as WorkflowRuntimeResumeRunRequest;
    const response = await runtimeService.resumeRun(payload);
    res.json(response);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/internal/runtime/runs/:runId', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId);
  if (!authorized) return;
  const snapshot = runtimeService.getRun(req.params.runId);
  if (!snapshot) {
    res.status(404).json({ error: 'run not found' });
    return;
  }
  res.json({
    schemaVersion: 'v1',
    run: snapshot,
  });
});

app.get('/internal/runtime/approvals', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId);
  if (!authorized) return;
  res.json({
    schemaVersion: 'v1',
    approvals: runtimeService.listApprovals(),
  });
});

app.get('/internal/runtime/artifacts/:artifactId', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId);
  if (!authorized) return;
  const artifact = runtimeService.getArtifact(req.params.artifactId);
  if (!artifact) {
    res.status(404).json({ error: 'artifact not found' });
    return;
  }
  res.json({
    schemaVersion: 'v1',
    artifact,
  });
});

const server = app.listen(PORT, () => {
  logger.info('workflow runtime listening', { port: PORT });
});

async function shutdown(): Promise<void> {
  await runtimeService.close().catch(() => undefined);
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
