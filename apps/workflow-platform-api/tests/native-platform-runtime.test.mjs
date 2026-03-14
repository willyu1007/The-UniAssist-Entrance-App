import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function getAvailablePort() {
  return await new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('failed to acquire dynamic port')));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise(address.port);
      });
    });
  });
}

function startService(name, args, env = {}) {
  const child = spawn('pnpm', args, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  return child;
}

async function waitForHealth(url, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await sleep(250);
  }
  throw new Error(`health timeout for ${url}`);
}

async function httpGet(url) {
  const response = await fetch(url);
  const json = await response.json();
  return { status: response.status, json };
}

async function httpPost(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, json };
}

async function httpPatch(url, body) {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, json };
}

function buildNativeNodes() {
  return [
    {
      nodeKey: 'emit_draft',
      nodeType: 'executor',
      executorId: 'platform.emit_artifact',
      config: {
        artifactType: 'NativeDraftArtifact',
        state: 'review_required',
        payloadMode: 'input',
      },
      transitions: {
        success: 'approval_gate',
      },
    },
    {
      nodeKey: 'approval_gate',
      nodeType: 'approval_gate',
      config: {
        reviewArtifactTypes: ['NativeDraftArtifact'],
      },
      transitions: {
        approved: 'collect_feedback',
      },
    },
    {
      nodeKey: 'collect_feedback',
      nodeType: 'executor',
      executorId: 'platform.request_interaction',
      config: {
        prompt: 'Provide feedback to continue',
        answerSchemaJson: {
          type: 'object',
          properties: {
            decision: { type: 'string' },
          },
          required: ['decision'],
        },
        uiSchemaJson: {
          order: ['decision'],
        },
        responseArtifactType: 'NativeResponseArtifact',
      },
      transitions: {
        success: 'finish',
      },
    },
    {
      nodeKey: 'finish',
      nodeType: 'end',
    },
  ];
}

test('platform api drives pure v1 native kernel through webhook and schedule triggers', async (t) => {
  const runtimePort = await getAvailablePort();
  const platformPort = await getAvailablePort();
  const runtime = startService('runtime-native', ['--filter', '@uniassist/workflow-runtime', 'start'], {
    PORT: String(runtimePort),
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
  });
  const platform = startService('platform-native', ['--filter', '@uniassist/workflow-platform-api', 'start'], {
    PORT: String(platformPort),
    UNIASSIST_WORKFLOW_RUNTIME_BASE_URL: `http://127.0.0.1:${runtimePort}`,
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
  });

  t.after(async () => {
    platform.kill('SIGTERM');
    runtime.kill('SIGTERM');
    await sleep(500);
  });

  const platformBaseUrl = `http://127.0.0.1:${platformPort}`;
  await waitForHealth(`http://127.0.0.1:${runtimePort}/health`);
  await waitForHealth(`${platformBaseUrl}/health`);

  const sessionId = 'session-native-platform';
  const userId = 'owner-native-platform';

  const createDraft = await httpPost(`${platformBaseUrl}/v1/workflow-drafts`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
    workflowKey: 'native-platform-proof',
    name: 'Native Platform Proof',
  });
  assert.equal(createDraft.status, 201);
  const draftId = createDraft.json.draft.draftId;

  const patchNodes = await httpPatch(`${platformBaseUrl}/v1/workflow-drafts/${draftId}/spec`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
    baseRevisionId: createDraft.json.revision.revisionId,
    changeSummary: 'Replace draft nodes with native platform proof workflow',
    patch: {
      section: 'nodes',
      value: {
        entryNode: 'emit_draft',
        nodes: buildNativeNodes(),
      },
    },
  });
  assert.equal(patchNodes.status, 200);

  const validateDraft = await httpPost(`${platformBaseUrl}/v1/workflow-drafts/${draftId}/validate`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
  });
  assert.equal(validateDraft.status, 200);
  assert.equal(validateDraft.json.draft.publishable, true);

  const publishDraft = await httpPost(`${platformBaseUrl}/v1/workflow-drafts/${draftId}/publish`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
  });
  assert.equal(publishDraft.status, 200);
  const templateVersionId = publishDraft.json.version.templateVersionId;

  const createAgent = await httpPost(`${platformBaseUrl}/v1/agents`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-native-platform',
    templateVersionRef: templateVersionId,
    name: 'Native Proof Agent',
    createdBy: userId,
    ownerActorRef: userId,
    riskLevel: 'R1',
  });
  assert.equal(createAgent.status, 201);
  const agentId = createAgent.json.agent.agentId;

  const activateAgent = await httpPost(`${platformBaseUrl}/v1/agents/${agentId}/activate`, {
    schemaVersion: 'v1',
    userId,
    summary: 'Activate native proof agent',
  });
  assert.equal(activateAgent.status, 202);

  const approveActivation = await httpPost(
    `${platformBaseUrl}/v1/governance-change-requests/${activateAgent.json.governanceRequest.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'approver-native-platform',
    },
  );
  assert.equal(approveActivation.status, 200);
  assert.equal(approveActivation.json.agent.activationState, 'active');

  const createSecretRef = await httpPost(`${platformBaseUrl}/v1/secret-refs`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-native-platform',
    userId,
    environmentScope: '*',
    providerType: 'webhook_hmac',
    metadataJson: {
      envKey: 'TEST_NATIVE_WEBHOOK_SECRET',
    },
  });
  assert.equal(createSecretRef.status, 201);
  const secretRefId = createSecretRef.json.secretRef.secretRefId;

  const createWebhookTrigger = await httpPost(`${platformBaseUrl}/v1/agents/${agentId}/trigger-bindings`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-native-platform',
    userId,
    triggerKind: 'webhook',
    configJson: {
      secretRefId,
      signatureHeader: 'x-signature',
      timestampHeader: 'x-ts',
      dedupeHeader: 'x-delivery-id',
      replayWindowMs: 300000,
    },
  });
  assert.equal(createWebhookTrigger.status, 201);
  const webhookTriggerId = createWebhookTrigger.json.triggerBinding.triggerBindingId;

  const grantWebhookSecret = await httpPost(`${platformBaseUrl}/v1/governance-change-requests`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-native-platform',
    requestKind: 'scope_grant_issue',
    targetType: 'trigger_binding',
    targetRef: webhookTriggerId,
    requestedByActorId: userId,
    riskLevel: 'R1',
    summary: 'Grant webhook trigger access to its shared secret',
    desiredStateJson: {
      resourceType: 'secret_ref',
      resourceRef: secretRefId,
      scopeJson: {
        actions: ['verify_webhook'],
      },
    },
  });
  assert.equal(grantWebhookSecret.status, 201);

  const approveWebhookSecret = await httpPost(
    `${platformBaseUrl}/v1/governance-change-requests/${grantWebhookSecret.json.request.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'approver-native-platform',
    },
  );
  assert.equal(approveWebhookSecret.status, 200);

  const enableWebhookTrigger = await httpPost(`${platformBaseUrl}/v1/trigger-bindings/${webhookTriggerId}/enable`, {
    schemaVersion: 'v1',
    userId,
  });
  assert.equal(enableWebhookTrigger.status, 202);

  const approveWebhookTrigger = await httpPost(
    `${platformBaseUrl}/v1/governance-change-requests/${enableWebhookTrigger.json.governanceRequest.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'approver-native-platform',
    },
  );
  assert.equal(approveWebhookTrigger.status, 200);
  const publicTriggerKey = approveWebhookTrigger.json.triggerBinding.publicTriggerKey;
  assert.ok(publicTriggerKey);

  const createScheduleTrigger = await httpPost(`${platformBaseUrl}/v1/agents/${agentId}/trigger-bindings`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-native-platform',
    userId,
    triggerKind: 'schedule',
    configJson: {
      intervalMs: 1000,
      timezone: 'Asia/Shanghai',
      misfireStrategy: 'skip',
    },
  });
  assert.equal(createScheduleTrigger.status, 201);
  const scheduleTriggerId = createScheduleTrigger.json.triggerBinding.triggerBindingId;

  const enableScheduleTrigger = await httpPost(`${platformBaseUrl}/v1/trigger-bindings/${scheduleTriggerId}/enable`, {
    schemaVersion: 'v1',
    userId,
  });
  assert.equal(enableScheduleTrigger.status, 202);

  const approveScheduleTrigger = await httpPost(
    `${platformBaseUrl}/v1/governance-change-requests/${enableScheduleTrigger.json.governanceRequest.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'approver-native-platform',
    },
  );
  assert.equal(approveScheduleTrigger.status, 200);
  assert.equal(approveScheduleTrigger.json.triggerBinding.status, 'enabled');

  const dueTriggers = await httpGet(
    `${platformBaseUrl}/internal/trigger-bindings/due?timestampMs=${Date.now() + 5_000}`,
  );
  assert.equal(dueTriggers.status, 200);
  assert.ok(dueTriggers.json.triggers.some((trigger) => trigger.triggerBindingId === scheduleTriggerId));

  const dispatchWebhook = await httpPost(
    `${platformBaseUrl}/internal/webhook-triggers/${publicTriggerKey}/dispatch`,
    {
      schemaVersion: 'v1',
      dispatchKey: 'webhook:native-platform:1',
      firedAt: Date.now(),
      payload: {
        reviewerActor: {
          actorId: 'reviewer-native-platform',
        },
        draft: {
          title: 'Native webhook draft',
        },
      },
      headers: {
        'x-test': 'native',
      },
    },
  );
  assert.equal(dispatchWebhook.status, 202);
  assert.equal(dispatchWebhook.json.duplicate, false);
  const webhookRunId = dispatchWebhook.json.runId;

  const dispatchWebhookDuplicate = await httpPost(
    `${platformBaseUrl}/internal/webhook-triggers/${publicTriggerKey}/dispatch`,
    {
      schemaVersion: 'v1',
      dispatchKey: 'webhook:native-platform:1',
      firedAt: Date.now(),
      payload: {
        reviewerActor: {
          actorId: 'reviewer-native-platform',
        },
      },
      headers: {
        'x-test': 'native',
      },
    },
  );
  assert.equal(dispatchWebhookDuplicate.status, 202);
  assert.equal(dispatchWebhookDuplicate.json.duplicate, true);
  assert.equal(dispatchWebhookDuplicate.json.runId, webhookRunId);

  const runsAfterWebhook = await httpGet(`${platformBaseUrl}/v1/runs`);
  assert.equal(runsAfterWebhook.status, 200);
  assert.ok(runsAfterWebhook.json.runs.some((run) => run.runId === webhookRunId && run.blocker === 'waiting_approval'));

  const webhookRunDetail = await httpGet(`${platformBaseUrl}/v1/runs/${webhookRunId}`);
  assert.equal(webhookRunDetail.status, 200);
  assert.equal(webhookRunDetail.json.run.run.status, 'waiting_approval');
  assert.equal(webhookRunDetail.json.run.approvals.length, 1);
  assert.equal(webhookRunDetail.json.run.artifacts.length, 1);
  const approvalRequestId = webhookRunDetail.json.run.approvals[0].approvalRequestId;
  const artifactId = webhookRunDetail.json.run.artifacts[0].artifactId;

  const approvalQueue = await httpGet(`${platformBaseUrl}/v1/approvals/queue`);
  assert.equal(approvalQueue.status, 200);
  assert.ok(approvalQueue.json.approvals.some((approval) => approval.approvalRequestId === approvalRequestId));

  const approvalDetail = await httpGet(`${platformBaseUrl}/v1/approvals/${approvalRequestId}`);
  assert.equal(approvalDetail.status, 200);
  assert.equal(approvalDetail.json.approval.approvalRequestId, approvalRequestId);

  const artifactDetail = await httpGet(`${platformBaseUrl}/v1/artifacts/${artifactId}`);
  assert.equal(artifactDetail.status, 200);
  assert.equal(artifactDetail.json.artifact.artifactType, 'NativeDraftArtifact');

  const approveRun = await httpPost(`${platformBaseUrl}/v1/approvals/${approvalRequestId}/decision`, {
    schemaVersion: 'v1',
    traceId: 'trace-native-platform-approval',
    userId: 'reviewer-native-platform',
    decision: 'approved',
  });
  assert.equal(approveRun.status, 200);
  assert.equal(approveRun.json.run.run.status, 'waiting_interaction');
  const interactionRequestId = approveRun.json.run.interactionRequests[0].interactionRequestId;

  const respondInteraction = await httpPost(`${platformBaseUrl}/v1/interactions/${interactionRequestId}/responses`, {
    schemaVersion: 'v1',
    traceId: 'trace-native-platform-response',
    userId: 'reviewer-native-platform',
    payload: {
      decision: 'ship-native',
    },
  });
  assert.equal(respondInteraction.status, 200);
  assert.equal(respondInteraction.json.run.run.status, 'completed');
  assert.equal(respondInteraction.json.run.artifacts.length, 2);

  const completedRunDetail = await httpGet(`${platformBaseUrl}/v1/runs/${webhookRunId}`);
  assert.equal(completedRunDetail.status, 200);
  assert.equal(completedRunDetail.json.run.run.status, 'completed');
  assert.ok(
    completedRunDetail.json.run.artifacts.some((artifact) => artifact.artifactType === 'NativeResponseArtifact'),
  );

  const dispatchSchedule = await httpPost(
    `${platformBaseUrl}/internal/trigger-bindings/${scheduleTriggerId}/dispatch`,
    {
      schemaVersion: 'v1',
      dispatchKey: `schedule:${scheduleTriggerId}:1`,
      firedAt: Date.now(),
      payload: {
        reviewerActor: {
          actorId: 'reviewer-native-schedule',
        },
        draft: {
          title: 'Native schedule draft',
        },
      },
      headers: {
        'x-uniassist-trigger-source': 'test',
      },
    },
  );
  assert.equal(dispatchSchedule.status, 202);
  assert.equal(dispatchSchedule.json.duplicate, false);
  assert.notEqual(dispatchSchedule.json.runId, webhookRunId);

  const dispatchScheduleDuplicate = await httpPost(
    `${platformBaseUrl}/internal/trigger-bindings/${scheduleTriggerId}/dispatch`,
    {
      schemaVersion: 'v1',
      dispatchKey: `schedule:${scheduleTriggerId}:1`,
      firedAt: Date.now(),
      payload: {
        reviewerActor: {
          actorId: 'reviewer-native-schedule',
        },
      },
      headers: {
        'x-uniassist-trigger-source': 'test',
      },
    },
  );
  assert.equal(dispatchScheduleDuplicate.status, 202);
  assert.equal(dispatchScheduleDuplicate.json.duplicate, true);

  const runsAfterSchedule = await httpGet(`${platformBaseUrl}/v1/runs`);
  assert.equal(runsAfterSchedule.status, 200);
  assert.ok(runsAfterSchedule.json.runs.some((run) => run.runId === dispatchSchedule.json.runId));
} );
