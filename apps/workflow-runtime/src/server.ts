import type { Request, Response } from 'express';
import express from 'express';

import { createMemoryNonceStore, createLogger, verifyInternalAuthRequest } from '@uniassist/shared';
import { createConnectorRuntimeClient } from '@uniassist/connector-sdk';
import { createExternalBridgeClient } from '@uniassist/executor-sdk';
import type {
  WorkflowApprovalDecisionRequest,
  WorkflowApprovalDecisionResponse,
  WorkflowApprovalDetailResponse,
  WorkflowApprovalQueueResponse,
  WorkflowArtifactDetailResponse,
  WorkflowInteractionRequestRecord,
  WorkflowRunListResponse,
  WorkflowRunQueryResponse,
  WorkflowRuntimeBridgeCallbackRequest,
  WorkflowRuntimeBridgeCallbackResponse,
  WorkflowRuntimeCancelRunRequest,
  WorkflowRuntimeConnectorActionSessionLookupResponse,
  WorkflowRuntimeConnectorCallbackRequest,
  WorkflowRuntimeConnectorCallbackResponse,
  WorkflowRuntimeRecordEventSubscriptionReceiptRequest,
  WorkflowRuntimeRecordEventSubscriptionReceiptResponse,
  WorkflowRuntimeResumeRunRequest,
  WorkflowRuntimeStartRunRequest,
} from '@uniassist/workflow-contracts';
import {
  CONNECTOR_RUNTIME_ALLOWED_SUBJECTS,
  CONNECTOR_RUNTIME_BASE_URL,
  CONNECTOR_RUNTIME_SERVICE_ID,
  DATABASE_URL,
  EXTERNAL_BRIDGE_ALLOWED_SUBJECTS,
  INTERNAL_AUTH_CONFIG,
  PORT,
  now,
  uuid,
} from './config';
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
  connectorRuntimeClient: createConnectorRuntimeClient({
    baseUrl: CONNECTOR_RUNTIME_BASE_URL,
    internalAuthConfig: INTERNAL_AUTH_CONFIG,
    connectorRuntimeServiceId: CONNECTOR_RUNTIME_SERVICE_ID,
  }),
  externalBridgeClient: createExternalBridgeClient({
    internalAuthConfig: INTERNAL_AUTH_CONFIG,
  }),
  databaseUrl: DATABASE_URL || undefined,
  now,
  uuid,
});

function handleRuntimeError(res: Response, error: unknown): void {
  if (error && typeof error === 'object' && 'status' in error) {
    const runtimeError = error as { status: number; code?: unknown };
    res.status(Number(runtimeError.status) || 400).json({
      error: error instanceof Error ? error.message : String(error),
      code: typeof runtimeError.code === 'string' ? runtimeError.code : 'RUNTIME_REQUEST_FAILED',
    });
    return;
  }
  res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
}

async function guardInternalAuth(
  req: RawBodyRequest,
  res: Response,
  expectedAudience: string,
  allowedSubjects: string[] = ['workflow-platform-api'],
  requiredScopes?: string[],
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
    allowedSubjects,
    requiredScopes,
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
    handleRuntimeError(res, error);
  }
});

app.post('/internal/runtime/cancel-run', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId);
  if (!authorized) return;
  try {
    const payload = req.body as WorkflowRuntimeCancelRunRequest;
    const response = await runtimeService.cancelRun(payload);
    res.json(response);
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      const runtimeError = error as { status: number; code?: unknown };
      res.status(Number((error as { status: number }).status) || 400).json({
        error: error instanceof Error ? error.message : String(error),
        code: typeof runtimeError.code === 'string' ? runtimeError.code : 'RUNTIME_REQUEST_FAILED',
      });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/internal/runtime/bridge-callback', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(
    req,
    res,
    INTERNAL_AUTH_CONFIG.serviceId,
    EXTERNAL_BRIDGE_ALLOWED_SUBJECTS,
    ['bridge:callback'],
  );
  if (!authorized) return;
  try {
    const payload = req.body as WorkflowRuntimeBridgeCallbackRequest;
    const response: WorkflowRuntimeBridgeCallbackResponse = await runtimeService.handleBridgeCallback(payload);
    res.json(response);
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      const runtimeError = error as { status: number; code?: unknown };
      res.status(Number((error as { status: number }).status) || 400).json({
        error: error instanceof Error ? error.message : String(error),
        code: typeof runtimeError.code === 'string' ? runtimeError.code : 'RUNTIME_REQUEST_FAILED',
      });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/internal/runtime/connector-callback', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(
    req,
    res,
    INTERNAL_AUTH_CONFIG.serviceId,
    CONNECTOR_RUNTIME_ALLOWED_SUBJECTS,
    ['connector:callback'],
  );
  if (!authorized) return;
  try {
    const payload = req.body as WorkflowRuntimeConnectorCallbackRequest;
    const response: WorkflowRuntimeConnectorCallbackResponse = await runtimeService.handleConnectorCallback(payload);
    res.json(response);
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      const runtimeError = error as { status: number; code?: unknown };
      res.status(Number((error as { status: number }).status) || 400).json({
        error: error instanceof Error ? error.message : String(error),
        code: typeof runtimeError.code === 'string' ? runtimeError.code : 'RUNTIME_REQUEST_FAILED',
      });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/internal/runtime/event-subscription-receipts', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId);
  if (!authorized) return;
  try {
    const payload = req.body as WorkflowRuntimeRecordEventSubscriptionReceiptRequest;
    const response: WorkflowRuntimeRecordEventSubscriptionReceiptResponse = await runtimeService.recordEventSubscriptionReceipt(
      payload,
    );
    res.json(response);
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      const runtimeError = error as { status: number; code?: unknown };
      res.status(Number((error as { status: number }).status) || 400).json({
        error: error instanceof Error ? error.message : String(error),
        code: typeof runtimeError.code === 'string' ? runtimeError.code : 'RUNTIME_REQUEST_FAILED',
      });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/internal/runtime/connector-action-sessions/:publicCallbackKey', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(
    req,
    res,
    INTERNAL_AUTH_CONFIG.serviceId,
    CONNECTOR_RUNTIME_ALLOWED_SUBJECTS,
    ['connector:lookup'],
  );
  if (!authorized) return;
  try {
    const response: WorkflowRuntimeConnectorActionSessionLookupResponse = await runtimeService.getConnectorActionSessionByPublicCallbackKey(
      req.params.publicCallbackKey,
    );
    res.json(response);
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      const runtimeError = error as { status: number; code?: unknown };
      res.status(Number((error as { status: number }).status) || 400).json({
        error: error instanceof Error ? error.message : String(error),
        code: typeof runtimeError.code === 'string' ? runtimeError.code : 'RUNTIME_REQUEST_FAILED',
      });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/internal/runtime/runs', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId);
  if (!authorized) return;
  const limit = Number(req.query.limit || 25);
  const response: WorkflowRunListResponse = await runtimeService.listRunSummaries(
    Number.isFinite(limit) && limit > 0 ? limit : 25,
  );
  res.json(response);
});

app.get('/internal/runtime/runs/:runId', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId);
  if (!authorized) return;
  const snapshot = await runtimeService.getRun(req.params.runId);
  if (!snapshot) {
    res.status(404).json({ error: 'run not found' });
    return;
  }
  const response: WorkflowRunQueryResponse = {
    schemaVersion: 'v1',
    run: snapshot,
  };
  res.json(response);
});

app.get('/internal/runtime/interactions/:interactionRequestId', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId);
  if (!authorized) return;
  const interactionRequest = await runtimeService.getInteractionRequest(req.params.interactionRequestId);
  if (!interactionRequest) {
    res.status(404).json({ error: 'interaction request not found' });
    return;
  }
  res.json({
    schemaVersion: 'v1',
    runId: interactionRequest.runId,
    interactionRequest: interactionRequest as WorkflowInteractionRequestRecord,
  });
});

app.get('/internal/runtime/approvals', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId);
  if (!authorized) return;
  res.json({
    schemaVersion: 'v1',
    approvals: await runtimeService.listApprovals(),
  });
});

app.get('/internal/runtime/approvals/queue', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId);
  if (!authorized) return;
  const response: WorkflowApprovalQueueResponse = {
    schemaVersion: 'v1',
    approvals: await runtimeService.listApprovalQueue(),
  };
  res.json(response);
});

app.get('/internal/runtime/approvals/:approvalRequestId', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId);
  if (!authorized) return;
  const detail = await runtimeService.getApprovalDetail(req.params.approvalRequestId);
  if (!detail) {
    res.status(404).json({ error: 'approval not found' });
    return;
  }
  const response: WorkflowApprovalDetailResponse = detail;
  res.json(response);
});

app.post('/internal/runtime/approvals/:approvalRequestId/decision', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId);
  if (!authorized) return;
  try {
    const body = req.body as WorkflowApprovalDecisionRequest;
    const response: WorkflowApprovalDecisionResponse = await runtimeService.decideApproval(
      req.params.approvalRequestId,
      {
        traceId: body.traceId,
        userId: body.userId,
        decision: body.decision,
        comment: body.comment,
      },
    );
    res.json(response);
  } catch (error) {
    handleRuntimeError(res, error);
  }
});

app.get('/internal/runtime/artifacts/:artifactId', async (req: RawBodyRequest, res) => {
  const authorized = await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId);
  if (!authorized) return;
  const artifact = await runtimeService.getArtifact(req.params.artifactId);
  if (!artifact) {
    res.status(404).json({ error: 'artifact not found' });
    return;
  }
  const response: WorkflowArtifactDetailResponse = {
    schemaVersion: 'v1',
    artifact,
    typedPayload: artifact.payloadJson,
    lineage: (
      artifact.metadataJson
      && typeof artifact.metadataJson.lineage === 'object'
      && artifact.metadataJson.lineage !== null
      && Array.isArray(artifact.metadataJson.lineage) === false
    )
      ? artifact.metadataJson.lineage as Record<string, unknown>
      : {},
  };
  res.json(response);
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
