import type { Request, Response } from 'express';
import express from 'express';

import { createExternalBridgeClient } from '@baseinterface/executor-sdk';
import { createLogger, createMemoryNonceStore, verifyInternalAuthRequest } from '@baseinterface/shared';
import {
  CONNECTOR_RUNTIME_SERVICE_ID,
  DATABASE_URL,
  INTERNAL_AUTH_CONFIG,
  PORT,
  UNIASSIST_CONVEX_URL,
  UNIASSIST_ENABLE_CONVEX_RUNBOARD_EXPERIMENT,
  TRIGGER_SCHEDULER_SERVICE_ID,
  WORKFLOW_RUNTIME_BASE_URL,
  WORKFLOW_RUNTIME_PUBLIC_BASE_URL,
  WORKFLOW_RUNTIME_SERVICE_ID,
  now,
  uuid,
} from './config';
import { ControlConsoleStreamBroker } from './control-console-stream';
import { createPlatformController } from './platform-controller';
import { createGovernanceRepository } from './governance-repository';
import { createPlatformRepository } from './platform-repository';
import { createPlatformService } from './platform-service';
import { createRunboardProjectionAdapter, RunboardProjectionController } from './runboard-projection';
import { RuntimeClient } from './runtime-client';

type RawBodyRequest = Request & { rawBody?: string };

const logger = createLogger({ service: 'workflow-platform-api' });
const internalNonceStore = createMemoryNonceStore();

const repository = createPlatformRepository(DATABASE_URL || undefined);
const governanceRepository = createGovernanceRepository(DATABASE_URL || undefined);
const runtimeClient = new RuntimeClient({
  baseUrl: WORKFLOW_RUNTIME_BASE_URL,
  internalAuthConfig: INTERNAL_AUTH_CONFIG,
  runtimeServiceId: WORKFLOW_RUNTIME_SERVICE_ID,
});
const externalBridgeClient = createExternalBridgeClient({
  internalAuthConfig: INTERNAL_AUTH_CONFIG,
});
const service = createPlatformService({
  repository,
  governanceRepository,
  runtimeClient,
  externalBridgeClient,
  runtimePublicBaseUrl: WORKFLOW_RUNTIME_PUBLIC_BASE_URL,
  now,
  uuid,
});
const controlConsoleBroker = new ControlConsoleStreamBroker();
const runboardProjection = new RunboardProjectionController({
  adapter: createRunboardProjectionAdapter({
    enabled: UNIASSIST_ENABLE_CONVEX_RUNBOARD_EXPERIMENT,
    url: UNIASSIST_CONVEX_URL || undefined,
  }),
  runtimeClient,
  broker: controlConsoleBroker,
});
void runboardProjection.start().catch((error) => {
  logger.warn('runboard projection failed to start', {
    error: error instanceof Error ? error.message : String(error),
  });
});
const controller = createPlatformController(service, controlConsoleBroker, runboardProjection);

const app = express();
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as RawBodyRequest).rawBody = buf.toString('utf8');
  },
}));

async function guardInternalAuth(
  req: RawBodyRequest,
  res: Response,
  expectedAudience: string,
  allowedSubjects: string[] = [TRIGGER_SCHEDULER_SERVICE_ID],
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
  });
  if (verification.ok || INTERNAL_AUTH_CONFIG.mode === 'audit') {
    return true;
  }
  res.status(verification.status).json({
    schemaVersion: 'v1',
    error: verification.message,
    code: verification.code,
  });
  return false;
}

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
app.post('/v1/interactions/:interactionRequestId/responses', controller.respondInteraction);
app.post('/v1/runs/:runId/interactions/:interactionRequestId/responses', controller.respondInteraction);
app.get('/v1/approvals', controller.listApprovals);
app.get('/v1/approvals/queue', controller.listApprovalQueue);
app.get('/v1/approvals/:approvalRequestId', controller.getApprovalDetail);
app.post('/v1/approvals/:approvalRequestId/decision', controller.decideApproval);
app.get('/v1/artifacts/:artifactId', controller.getArtifact);
app.post('/v1/runs/:runId/cancel', controller.cancelRun);
app.patch('/v1/workflow-drafts/:draftId/spec', controller.patchDraftSpec);
app.get('/v1/bridge-registrations', controller.listBridgeRegistrations);
app.post('/v1/bridge-registrations', controller.createBridgeRegistration);
app.get('/v1/bridge-registrations/:bridgeId', controller.getBridgeRegistration);
app.post('/v1/bridge-registrations/:bridgeId/activate', controller.activateBridgeRegistration);
app.post('/v1/bridge-registrations/:bridgeId/suspend', controller.suspendBridgeRegistration);
app.get('/v1/connector-definitions', controller.listConnectorDefinitions);
app.post('/v1/connector-definitions', controller.createConnectorDefinition);
app.get('/v1/connector-definitions/:connectorDefinitionId', controller.getConnectorDefinition);
app.get('/v1/connector-bindings', controller.listConnectorBindings);
app.post('/v1/connector-bindings', controller.createConnectorBinding);
app.get('/v1/connector-bindings/:connectorBindingId', controller.getConnectorBinding);
app.get('/v1/agents', controller.listAgents);
app.post('/v1/agents', controller.createAgent);
app.get('/v1/agents/:agentId', controller.getAgent);
app.post('/v1/agents/:agentId/activate', controller.activateAgent);
app.post('/v1/agents/:agentId/suspend', controller.suspendAgent);
app.post('/v1/agents/:agentId/retire', controller.retireAgent);
app.post('/v1/agents/:agentId/runs', controller.startAgentRun);
app.get('/v1/agents/:agentId/action-bindings', controller.listActionBindings);
app.post('/v1/agents/:agentId/action-bindings', controller.createActionBinding);
app.get('/v1/agents/:agentId/trigger-bindings', controller.listTriggerBindings);
app.post('/v1/agents/:agentId/trigger-bindings', controller.createTriggerBinding);
app.get('/v1/action-bindings/:actionBindingId', controller.getActionBinding);
app.get('/v1/event-subscriptions', controller.listEventSubscriptions);
app.post('/v1/event-subscriptions', controller.createEventSubscription);
app.get('/v1/event-subscriptions/:eventSubscriptionId', controller.getEventSubscription);
app.post('/v1/trigger-bindings/:triggerBindingId/enable', controller.enableTriggerBinding);
app.post('/v1/trigger-bindings/:triggerBindingId/disable', controller.disableTriggerBinding);
app.get('/v1/policy-bindings', controller.listPolicyBindings);
app.post('/v1/policy-bindings', controller.createPolicyBinding);
app.get('/v1/secret-refs', controller.listSecretRefs);
app.post('/v1/secret-refs', controller.createSecretRef);
app.get('/v1/scope-grants', controller.listScopeGrants);
app.get('/v1/governance-change-requests', controller.listGovernanceChangeRequests);
app.post('/v1/governance-change-requests', controller.createGovernanceChangeRequest);
app.get('/v1/governance-change-requests/:requestId', controller.getGovernanceChangeRequest);
app.post('/v1/governance-change-requests/:requestId/approve', controller.approveGovernanceChangeRequest);
app.post('/v1/governance-change-requests/:requestId/reject', controller.rejectGovernanceChangeRequest);

app.get('/internal/trigger-bindings/due', async (req: RawBodyRequest, res) => {
  if (!(await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId))) return;
  await controller.listDueScheduleTriggers(req, res);
});
app.get('/internal/webhook-triggers/:publicTriggerKey/runtime-config', async (req: RawBodyRequest, res) => {
  if (!(await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId))) return;
  await controller.getWebhookTriggerRuntimeConfig(req, res);
});
app.post('/internal/trigger-bindings/:triggerBindingId/dispatch', async (req: RawBodyRequest, res) => {
  if (!(await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId))) return;
  await controller.dispatchScheduleTrigger(req, res);
});
app.post('/internal/webhook-triggers/:publicTriggerKey/dispatch', async (req: RawBodyRequest, res) => {
  if (!(await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId))) return;
  await controller.dispatchWebhookTrigger(req, res);
});
app.get('/internal/event-subscriptions/:publicSubscriptionKey/runtime-config', async (req: RawBodyRequest, res) => {
  if (!(await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId, [CONNECTOR_RUNTIME_SERVICE_ID]))) return;
  await controller.getEventSubscriptionRuntimeConfig(req, res);
});
app.post('/internal/event-subscriptions/:publicSubscriptionKey/dispatch', async (req: RawBodyRequest, res) => {
  if (!(await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId, [CONNECTOR_RUNTIME_SERVICE_ID]))) return;
  await controller.dispatchEventSubscription(req, res);
});

const server = app.listen(PORT, () => {
  logger.info('workflow platform api listening', {
    port: PORT,
    persistence: DATABASE_URL ? 'postgres' : 'memory',
  });
});

async function shutdown(): Promise<void> {
  await runboardProjection.close().catch(() => undefined);
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
