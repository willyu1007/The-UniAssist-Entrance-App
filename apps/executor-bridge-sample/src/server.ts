import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import express from 'express';

import {
  buildInternalAuthHeaders,
  createLogger,
  createMemoryNonceStore,
  loadInternalAuthConfigFromEnv,
  verifyInternalAuthRequest,
} from '@baseinterface/shared';
import type {
  BridgeHealth,
  BridgeManifest,
  ExternalRuntimeBridgeCancelRequest,
  ExternalRuntimeBridgeCancelResponse,
  ExternalRuntimeBridgeInvokeRequest,
  ExternalRuntimeBridgeInvokeResponse,
  ExternalRuntimeBridgeResumeRequest,
  ExternalRuntimeBridgeResumeResponse,
  WorkflowRuntimeBridgeCallbackRequest,
} from '@baseinterface/workflow-contracts';

const PORT = Number(process.env.PORT || 8894);
const INTERNAL_AUTH_DEFAULT_SERVICE_ID = 'executor-bridge-sample';
const INTERNAL_AUTH_CONFIG = (() => {
  const config = loadInternalAuthConfigFromEnv(process.env);
  if (config.serviceId === 'unknown') {
    config.serviceId = INTERNAL_AUTH_DEFAULT_SERVICE_ID;
  }
  return config;
})();
const WORKFLOW_RUNTIME_SERVICE_ID = process.env.UNIASSIST_WORKFLOW_RUNTIME_SERVICE_ID || 'workflow-runtime';
const logger = createLogger({ service: 'executor-bridge-sample' });
const internalNonceStore = createMemoryNonceStore();

type RawBodyRequest = Request & { rawBody?: string };

type BridgeSession = {
  externalSessionRef: string;
  bridgeId: string;
  runId: string;
  nodeRunId: string;
  callbackUrl: string;
  workspaceId: string;
  sessionId: string;
  userId: string;
  agentId: string;
  capabilityRef?: string;
  nextSequence: number;
  status: 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
  resumeToken?: string;
};

const bridgeSessions = new Map<string, BridgeSession>();

const manifest: BridgeManifest = {
  schemaVersion: 'v1',
  bridgeVersion: '0.1.0',
  runtimeType: 'external_agent_runtime',
  displayName: 'Sample External Runtime Bridge',
  callbackMode: 'async_webhook',
  supportsResume: true,
  supportsCancel: true,
  capabilities: [
    {
      capabilityId: 'compat-sample',
      name: 'Vendor-neutral sample capability',
      description: 'Produces checkpoint, approval, and result callbacks for B6 validation.',
      supportsResume: true,
      supportsCancel: true,
      supportsApproval: true,
    },
  ],
};

function now(): number {
  return Date.now();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Array.isArray(value) === false;
}

async function guardInternalAuth(
  req: RawBodyRequest,
  res: Response,
  requiredScopes: string[],
  allowedSubjects: string[],
): Promise<boolean> {
  if (INTERNAL_AUTH_CONFIG.mode === 'off') return true;
  const verification = await verifyInternalAuthRequest({
    method: req.method,
    path: req.path,
    rawBody: req.rawBody || '',
    headers: req.headers as Record<string, string | string[] | undefined>,
    config: INTERNAL_AUTH_CONFIG,
    nonceStore: internalNonceStore,
    expectedAudience: INTERNAL_AUTH_CONFIG.serviceId,
    requiredScopes,
    allowedSubjects,
  });
  if (verification.ok || INTERNAL_AUTH_CONFIG.mode === 'audit') return true;
  res.status(verification.status).json({
    schemaVersion: 'v1',
    error: verification.message,
    code: verification.code,
  });
  return false;
}

function scheduleTask(delayMs: number, fn: () => Promise<void>): void {
  setTimeout(() => {
    void fn().catch((error) => {
      logger.warn('sample bridge async task failed', { error: error instanceof Error ? error.message : String(error) });
    });
  }, delayMs);
}

async function postCallback(
  session: BridgeSession,
  kind: WorkflowRuntimeBridgeCallbackRequest['kind'],
  payload?: Record<string, unknown>,
): Promise<void> {
  if (session.status === 'cancelled') {
    return;
  }
  const callback = {
    schemaVersion: 'v1',
    traceId: crypto.randomUUID(),
    callbackId: crypto.randomUUID(),
    sequence: session.nextSequence,
    bridgeId: session.bridgeId,
    runId: session.runId,
    nodeRunId: session.nodeRunId,
    externalSessionRef: session.externalSessionRef,
    kind,
    emittedAt: now(),
    payload,
  } satisfies WorkflowRuntimeBridgeCallbackRequest;
  session.nextSequence += 1;

  const target = new URL(session.callbackUrl);
  const rawBody = JSON.stringify(callback);
  const headers = buildInternalAuthHeaders(INTERNAL_AUTH_CONFIG, {
    method: 'POST',
    path: target.pathname,
    rawBody,
    audience: WORKFLOW_RUNTIME_SERVICE_ID,
    scopes: ['bridge:callback'],
  });
  const response = await fetch(session.callbackUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: headers.authorization,
      'x-uniassist-internal-kid': headers['x-uniassist-internal-kid'],
      'x-uniassist-internal-ts': headers['x-uniassist-internal-ts'],
      'x-uniassist-internal-nonce': headers['x-uniassist-internal-nonce'],
      'x-uniassist-internal-signature': headers['x-uniassist-internal-signature'],
    },
    body: rawBody,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`runtime callback failed (${response.status}): ${body}`);
  }
}

function scheduleInitialCallbacks(session: BridgeSession): void {
  scheduleTask(20, async () => {
    if (session.status === 'cancelled') return;
    await postCallback(session, 'checkpoint', {
      stage: 'invoked',
      capabilityRef: session.capabilityRef,
    });
  });
  scheduleTask(60, async () => {
    if (session.status === 'cancelled') return;
    session.status = 'waiting_approval';
    session.resumeToken = crypto.randomUUID();
    await postCallback(session, 'approval_requested', {
      prompt: 'Approve sample bridge execution to continue.',
      requestedActorId: session.userId,
      resumeToken: session.resumeToken,
      metadata: {
        bridge: 'sample',
      },
    });
  });
}

function scheduleResumeCallbacks(session: BridgeSession, decision?: 'approved' | 'rejected'): void {
  if (decision === 'rejected') {
    scheduleTask(20, async () => {
      if (session.status === 'cancelled') return;
      session.status = 'failed';
      await postCallback(session, 'error', {
        message: 'Execution was rejected during external approval.',
        code: 'APPROVAL_REJECTED',
      });
    });
    return;
  }

  scheduleTask(20, async () => {
    if (session.status === 'cancelled') return;
    await postCallback(session, 'checkpoint', {
      stage: 'resumed',
      capabilityRef: session.capabilityRef,
    });
  });
  scheduleTask(60, async () => {
    if (session.status === 'cancelled') return;
    session.status = 'completed';
    await postCallback(session, 'result', {
      artifacts: [
        {
          artifactType: 'AssessmentDraft',
          state: 'published',
          payload: {
            subjectRef: 'student:bridge-case',
            subjectType: 'student',
            findings: ['Bridge assessment completed'],
            strengths: ['External runtime callback flow verified'],
            concerns: ['Requires manual follow-up'],
            recommendedActions: ['Send final review summary'],
          },
          metadata: {
            lineage: {
              nodeKey: session.nodeRunId,
              source: 'executor-bridge-sample',
            },
          },
        },
        {
          artifactType: 'EvidencePack',
          state: 'validated',
          payload: {
            subjectRef: 'student:bridge-case',
            subjectType: 'student',
            sourceArtifactRefs: [],
            observationRefs: [],
            supportingExcerpts: ['Bridge checkpoint accepted'],
            confidenceNotes: ['Synthetic sample data'],
          },
        },
      ],
      actorProfiles: [
        {
          actorId: 'parent:bridge-case',
          workspaceId: session.workspaceId,
          status: 'active',
          displayName: 'Bridge Parent',
          actorType: 'external_contact',
        },
      ],
      audienceSelector: {
        audienceSelectorId: `audience-${session.externalSessionRef}`,
        status: 'validated',
        selectorJson: {
          actorIds: ['parent:bridge-case'],
        },
      },
      deliverySpec: {
        deliverySpecId: `delivery-spec-${session.externalSessionRef}`,
        audienceSelectorId: `audience-${session.externalSessionRef}`,
        reviewRequired: false,
        deliveryMode: 'manual_handoff',
        status: 'validated',
      },
      deliveryTargets: [
        {
          deliveryTargetId: `delivery-target-${session.externalSessionRef}`,
          deliverySpecId: `delivery-spec-${session.externalSessionRef}`,
          targetActorId: 'parent:bridge-case',
          status: 'ready',
          payloadJson: {
            channel: 'manual_handoff',
          },
        },
      ],
    });
  });
}

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

app.get('/health', (_req, res) => {
  const payload: BridgeHealth = {
    schemaVersion: 'v1',
    status: 'ok',
    checkedAt: now(),
    details: {
      activeSessions: [...bridgeSessions.values()].filter((item) => item.status !== 'cancelled').length,
    },
  };
  res.json(payload);
});

app.get('/manifest', async (req: RawBodyRequest, res) => {
  if (!(await guardInternalAuth(req, res, ['bridge:read'], ['workflow-platform-api', 'workflow-runtime']))) return;
  res.json(manifest);
});

app.post('/invoke', async (req: RawBodyRequest, res) => {
  if (!(await guardInternalAuth(req, res, ['bridge:invoke'], ['workflow-runtime']))) return;
  const body = req.body as ExternalRuntimeBridgeInvokeRequest;
  const externalSessionRef = crypto.randomUUID();
  const session: BridgeSession = {
    externalSessionRef,
    bridgeId: body.bridgeId,
    runId: body.runId,
    nodeRunId: body.nodeRunId,
    callbackUrl: body.callback.url,
    workspaceId: body.workspaceId,
    sessionId: body.sessionId,
    userId: body.userId,
    agentId: body.agentId,
    capabilityRef: body.capabilityRef,
    nextSequence: 1,
    status: 'running',
  };
  bridgeSessions.set(externalSessionRef, session);
  scheduleInitialCallbacks(session);
  const response: ExternalRuntimeBridgeInvokeResponse = {
    schemaVersion: 'v1',
    status: 'accepted',
    externalSessionRef,
    metadata: {
      acceptedAt: now(),
    },
  };
  res.json(response);
});

app.post('/resume', async (req: RawBodyRequest, res) => {
  if (!(await guardInternalAuth(req, res, ['bridge:resume'], ['workflow-runtime']))) return;
  const body = req.body as ExternalRuntimeBridgeResumeRequest;
  const session = bridgeSessions.get(body.externalSessionRef);
  if (!session) {
    res.status(404).json({ error: 'session not found', code: 'SESSION_NOT_FOUND' });
    return;
  }
  if (session.status === 'cancelled') {
    res.status(409).json({ error: 'session already cancelled', code: 'SESSION_CANCELLED' });
    return;
  }
  session.status = 'running';
  session.resumeToken = undefined;
  scheduleResumeCallbacks(session, body.decision);
  const response: ExternalRuntimeBridgeResumeResponse = {
    schemaVersion: 'v1',
    status: 'accepted',
    externalSessionRef: session.externalSessionRef,
    metadata: {
      decision: body.decision,
    },
  };
  res.json(response);
});

app.post('/cancel', async (req: RawBodyRequest, res) => {
  if (!(await guardInternalAuth(req, res, ['bridge:cancel'], ['workflow-runtime']))) return;
  const body = req.body as ExternalRuntimeBridgeCancelRequest;
  const session = bridgeSessions.get(body.externalSessionRef);
  if (!session) {
    res.status(404).json({ error: 'session not found', code: 'SESSION_NOT_FOUND' });
    return;
  }
  session.status = 'cancelled';
  const response: ExternalRuntimeBridgeCancelResponse = {
    schemaVersion: 'v1',
    status: 'cancelled',
    externalSessionRef: session.externalSessionRef,
  };
  res.json(response);
});

const server = app.listen(PORT, () => {
  logger.info('executor bridge sample listening', { port: PORT });
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
