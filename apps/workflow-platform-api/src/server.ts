import express from 'express';

import { createLogger } from '@baseinterface/shared';
import type {
  WorkflowCreateRequest,
  WorkflowResumeRequest,
  WorkflowRuntimeResumeRunRequest,
  WorkflowRuntimeStartRunRequest,
  WorkflowStartRequest,
} from '@baseinterface/workflow-contracts';
import {
  INTERNAL_AUTH_CONFIG,
  PORT,
  WORKFLOW_RUNTIME_BASE_URL,
  WORKFLOW_RUNTIME_SERVICE_ID,
  now,
  uuid,
} from './config';
import { PlatformStore } from './platform-store';
import { RuntimeClient } from './runtime-client';

const logger = createLogger({ service: 'workflow-platform-api' });
const store = new PlatformStore();
const runtimeClient = new RuntimeClient({
  baseUrl: WORKFLOW_RUNTIME_BASE_URL,
  internalAuthConfig: INTERNAL_AUTH_CONFIG,
  runtimeServiceId: WORKFLOW_RUNTIME_SERVICE_ID,
});

const app = express();
app.use(express.json());

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

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'workflow-platform-api' });
});

app.post('/v1/workflows', (req, res) => {
  const body = req.body as WorkflowCreateRequest;
  if (!body?.workflowKey || !body?.name || !body?.compatProviderId || !body?.spec) {
    res.status(400).json({ error: 'workflowKey/name/compatProviderId/spec are required' });
    return;
  }
  const created = store.createWorkflow(body, {
    workflowId: uuid(),
    templateVersionId: uuid(),
    timestamp: now(),
  });
  res.status(201).json({
    schemaVersion: 'v1',
    workflow: created.workflow,
    version: created.version,
  });
});

app.get('/v1/workflows', (_req, res) => {
  res.json({
    schemaVersion: 'v1',
    workflows: store.listWorkflows(),
  });
});

app.get('/v1/workflows/:workflowId', (req, res) => {
  const workflow = store.getWorkflow(req.params.workflowId);
  if (!workflow) {
    res.status(404).json({ error: 'workflow not found' });
    return;
  }
  res.json({
    schemaVersion: 'v1',
    workflow,
  });
});

app.post('/v1/runs', async (req, res) => {
  try {
    const body = req.body as WorkflowStartRequest;
    const workflow = store.getWorkflowByKey(body.workflowKey);
    if (!workflow) {
      res.status(404).json({ error: 'workflow key not found' });
      return;
    }
    const version = body.templateVersionId
      ? store.getVersion(body.templateVersionId)
      : store.getLatestVersion(body.workflowKey);
    if (!version) {
      res.status(404).json({ error: 'workflow version not found' });
      return;
    }

    const response = await runtimeClient.startRun({
      schemaVersion: 'v1',
      traceId: body.traceId,
      sessionId: body.sessionId,
      userId: body.userId,
      template: workflow,
      version,
      inputText: body.inputText,
      inputPayload: body.inputPayload,
    } satisfies WorkflowRuntimeStartRunRequest);
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/v1/runs/:runId', async (req, res) => {
  try {
    const response = await runtimeClient.getRun(req.params.runId);
    res.json(response);
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/v1/runs/:runId/resume', async (req, res) => {
  try {
    const body = req.body as Omit<WorkflowResumeRequest, 'runId'>;
    const response = await runtimeClient.resumeRun({
      schemaVersion: 'v1',
      traceId: body.traceId,
      sessionId: body.sessionId,
      userId: body.userId,
      runId: req.params.runId,
      compatProviderId: '',
      actionId: body.actionId,
      replyToken: body.replyToken,
      taskId: body.taskId,
      payload: body.payload,
    } satisfies WorkflowRuntimeResumeRunRequest);
    res.json(response);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/v1/approvals', async (_req, res) => {
  try {
    const response = await runtimeClient.listApprovals();
    res.json(response);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/v1/artifacts/:artifactId', async (req, res) => {
  try {
    const response = await runtimeClient.getArtifact(req.params.artifactId);
    res.json(response);
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

const server = app.listen(PORT, () => {
  logger.info('workflow platform api listening', { port: PORT });
});

async function shutdown(): Promise<void> {
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
