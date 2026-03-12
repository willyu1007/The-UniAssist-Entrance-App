import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ports = {
  runtime: 9982,
  platform: 9981,
};

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
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

function buildRuntimeRunResponse(body, runId) {
  const timestamp = Date.now();
  return {
    schemaVersion: 'v1',
    run: {
      run: {
        runId,
        workflowId: body.template.workflowId,
        workflowKey: body.template.workflowKey,
        templateVersionId: body.version.templateVersionId,
        compatProviderId: body.template.compatProviderId,
        status: 'running',
        sessionId: body.sessionId,
        userId: body.userId,
        currentNodeRunId: 'node-entry',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      nodeRuns: [
        {
          nodeRunId: 'node-entry',
          runId,
          nodeKey: body.version?.spec?.entryNode || 'collect',
          nodeType: 'executor',
          status: 'running',
          executorId: 'compat-sample',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      approvals: [],
      approvalDecisions: [],
      artifacts: [],
    },
  };
}

function getZonedHourMinute(timestamp, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = formatter.formatToParts(new Date(timestamp));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

test('workflow platform api manages B5 agent governance and trigger dispatch', async (t) => {
  const runtimeStartRequests = [];
  let runtimeCounter = 0;

  const runtimeServer = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const body = rawBody ? JSON.parse(rawBody) : {};

      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === 'POST' && req.url === '/internal/runtime/start-run') {
        runtimeCounter += 1;
        runtimeStartRequests.push(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(buildRuntimeRunResponse(body, `run-b5-${runtimeCounter}`)));
        return;
      }

      if (req.method === 'GET' && req.url === '/internal/runtime/approvals') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ schemaVersion: 'v1', approvals: [] }));
        return;
      }

      if (req.method === 'GET' && req.url === '/internal/runtime/approvals/queue') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ schemaVersion: 'v1', approvals: [] }));
        return;
      }

      if (req.method === 'GET' && req.url?.startsWith('/internal/runtime/runs/')) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found', code: 'NOT_FOUND' }));
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found', code: 'NOT_FOUND' }));
    });
  });

  await new Promise((resolvePromise) => runtimeServer.listen(ports.runtime, resolvePromise));

  const platform = startService('platform-b5', ['--filter', '@baseinterface/workflow-platform-api', 'start'], {
    PORT: String(ports.platform),
    UNIASSIST_WORKFLOW_RUNTIME_BASE_URL: `http://127.0.0.1:${ports.runtime}`,
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
  });

  t.after(() => {
    platform.kill('SIGTERM');
    runtimeServer.close();
  });

  await waitForHealth(`http://127.0.0.1:${ports.platform}/health`);

  const createDraft = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts`, {
    schemaVersion: 'v1',
    sessionId: 'session-b5',
    userId: 'owner-1',
    workflowKey: 'b5-agent-governance',
    name: 'B5 Governance Workflow',
  });
  assert.equal(createDraft.status, 201);
  const draftId = createDraft.json.draft.draftId;

  const synthesizeDraft = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/synthesize`, {
    schemaVersion: 'v1',
    sessionId: 'session-b5',
    userId: 'owner-1',
  });
  assert.equal(synthesizeDraft.status, 200);

  const validateDraft = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/validate`, {
    schemaVersion: 'v1',
    sessionId: 'session-b5',
    userId: 'owner-1',
  });
  assert.equal(validateDraft.status, 200);
  assert.equal(validateDraft.json.draft.publishable, true);

  const publishDraft = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/publish`, {
    schemaVersion: 'v1',
    sessionId: 'session-b5',
    userId: 'owner-1',
  });
  assert.equal(publishDraft.status, 200);
  const templateVersionId = publishDraft.json.version.templateVersionId;

  const createAgent = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b5',
    templateVersionRef: templateVersionId,
    name: 'Daily Governance Agent',
    createdBy: 'owner-1',
    ownerActorRef: 'owner-1',
    riskLevel: 'R1',
  });
  assert.equal(createAgent.status, 201);
  assert.equal(createAgent.json.agent.activationState, 'draft');
  const agentId = createAgent.json.agent.agentId;

  const createTriggerWithWrongWorkspace = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/trigger-bindings`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-other',
    userId: 'owner-1',
    triggerKind: 'schedule',
    configJson: {
      intervalMs: 1000,
      timezone: 'Asia/Shanghai',
      misfireStrategy: 'skip',
    },
  });
  assert.equal(createTriggerWithWrongWorkspace.status, 409);
  assert.equal(createTriggerWithWrongWorkspace.json.code, 'TRIGGER_WORKSPACE_MISMATCH');

  const activateAgent = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/activate`, {
    schemaVersion: 'v1',
    userId: 'owner-1',
    summary: 'Activate the long-running agent',
  });
  assert.equal(activateAgent.status, 202);
  const activateRequestId = activateAgent.json.governanceRequest.requestId;

  const approveActivate = await httpPost(`http://127.0.0.1:${ports.platform}/v1/governance-change-requests/${activateRequestId}/approve`, {
    schemaVersion: 'v1',
    actorRef: 'approver-1',
  });
  assert.equal(approveActivate.status, 200);
  assert.equal(approveActivate.json.agent.activationState, 'active');

  const createPolicyBinding = await httpPost(`http://127.0.0.1:${ports.platform}/v1/policy-bindings`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b5',
    userId: 'owner-1',
    policyKind: 'invoke',
    targetType: 'agent_definition',
    targetRef: agentId,
    configJson: {
      mode: 'allow',
    },
  });
  assert.equal(createPolicyBinding.status, 201);
  const policyBindingId = createPolicyBinding.json.policyBinding.policyBindingId;

  const invalidPolicyRequest = await httpPost(`http://127.0.0.1:${ports.platform}/v1/governance-change-requests`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b5',
    requestKind: 'policy_bind_apply',
    targetType: 'agent_definition',
    targetRef: agentId,
    requestedByActorId: 'owner-1',
    riskLevel: 'R1',
    summary: 'This should fail because the target type is wrong',
    desiredStateJson: {},
  });
  assert.equal(invalidPolicyRequest.status, 400);
  assert.equal(invalidPolicyRequest.json.code, 'GOVERNANCE_TARGET_TYPE_INVALID');

  const missingPolicyRequest = await httpPost(`http://127.0.0.1:${ports.platform}/v1/governance-change-requests`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b5',
    requestKind: 'policy_bind_apply',
    targetType: 'policy_binding',
    targetRef: 'policy-missing',
    requestedByActorId: 'owner-1',
    riskLevel: 'R1',
    summary: 'This should fail because the policy binding does not exist',
    desiredStateJson: {},
  });
  assert.equal(missingPolicyRequest.status, 404);
  assert.equal(missingPolicyRequest.json.code, 'POLICY_BINDING_NOT_FOUND');

  const requestPolicyBinding = await httpPost(`http://127.0.0.1:${ports.platform}/v1/governance-change-requests`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b5',
    requestKind: 'policy_bind_apply',
    targetType: 'policy_binding',
    targetRef: policyBindingId,
    requestedByActorId: 'owner-1',
    riskLevel: 'R1',
    summary: 'Apply invoke policy',
    desiredStateJson: {},
  });
  assert.equal(requestPolicyBinding.status, 201);

  const approvePolicyBinding = await httpPost(
    `http://127.0.0.1:${ports.platform}/v1/governance-change-requests/${requestPolicyBinding.json.request.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'approver-1',
    },
  );
  assert.equal(approvePolicyBinding.status, 200);
  assert.equal(approvePolicyBinding.json.policyBinding.status, 'active');

  const createSecretRef = await httpPost(`http://127.0.0.1:${ports.platform}/v1/secret-refs`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b5',
    userId: 'owner-1',
    environmentScope: '*',
    providerType: 'webhook_hmac',
    metadataJson: {
      envKey: 'TEST_WEBHOOK_SECRET',
    },
  });
  assert.equal(createSecretRef.status, 201);
  const secretRefId = createSecretRef.json.secretRef.secretRefId;

  const createWebhookTrigger = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/trigger-bindings`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b5',
    userId: 'owner-1',
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

  const requestScopeGrant = await httpPost(`http://127.0.0.1:${ports.platform}/v1/governance-change-requests`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b5',
    requestKind: 'scope_grant_issue',
    targetType: 'trigger_binding',
    targetRef: webhookTriggerId,
    requestedByActorId: 'owner-1',
    riskLevel: 'R1',
    summary: 'Grant webhook trigger access to the shared secret',
    desiredStateJson: {
      resourceType: 'secret_ref',
      resourceRef: secretRefId,
      scopeJson: {
        actions: ['verify_webhook'],
      },
    },
  });
  assert.equal(requestScopeGrant.status, 201);

  const approveScopeGrant = await httpPost(
    `http://127.0.0.1:${ports.platform}/v1/governance-change-requests/${requestScopeGrant.json.request.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'approver-1',
    },
  );
  assert.equal(approveScopeGrant.status, 200);
  assert.equal(approveScopeGrant.json.scopeGrant.status, 'active');

  const enableWebhookTrigger = await httpPost(
    `http://127.0.0.1:${ports.platform}/v1/trigger-bindings/${webhookTriggerId}/enable`,
    {
      schemaVersion: 'v1',
      userId: 'owner-1',
    },
  );
  assert.equal(enableWebhookTrigger.status, 202);

  const approveWebhookTrigger = await httpPost(
    `http://127.0.0.1:${ports.platform}/v1/governance-change-requests/${enableWebhookTrigger.json.governanceRequest.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'approver-1',
    },
  );
  assert.equal(approveWebhookTrigger.status, 200);
  assert.equal(approveWebhookTrigger.json.triggerBinding.status, 'enabled');
  assert.ok(approveWebhookTrigger.json.triggerBinding.publicTriggerKey);
  const publicTriggerKey = approveWebhookTrigger.json.triggerBinding.publicTriggerKey;

  const webhookRuntimeConfig = await httpGet(
    `http://127.0.0.1:${ports.platform}/internal/webhook-triggers/${publicTriggerKey}/runtime-config`,
  );
  assert.equal(webhookRuntimeConfig.status, 200);
  assert.equal(webhookRuntimeConfig.json.trigger.secretEnvKey, 'TEST_WEBHOOK_SECRET');
  assert.equal(webhookRuntimeConfig.json.trigger.secretRefId, secretRefId);

  const dispatchWebhook = await httpPost(
    `http://127.0.0.1:${ports.platform}/internal/webhook-triggers/${publicTriggerKey}/dispatch`,
    {
      schemaVersion: 'v1',
      dispatchKey: 'webhook:test:1',
      firedAt: Date.now(),
      payload: { hello: 'webhook' },
      headers: { 'x-test': '1' },
    },
  );
  assert.equal(dispatchWebhook.status, 202);
  assert.equal(dispatchWebhook.json.duplicate, false);
  assert.equal(runtimeStartRequests.length, 1);
  assert.equal(runtimeStartRequests[0].sourceType, 'webhook');
  assert.equal(runtimeStartRequests[0].agentId, agentId);

  const dispatchWebhookDuplicate = await httpPost(
    `http://127.0.0.1:${ports.platform}/internal/webhook-triggers/${publicTriggerKey}/dispatch`,
    {
      schemaVersion: 'v1',
      dispatchKey: 'webhook:test:1',
      firedAt: Date.now(),
      payload: { hello: 'webhook' },
      headers: { 'x-test': '1' },
    },
  );
  assert.equal(dispatchWebhookDuplicate.status, 202);
  assert.equal(dispatchWebhookDuplicate.json.duplicate, true);
  assert.equal(runtimeStartRequests.length, 1);

  const createScheduleTrigger = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/trigger-bindings`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b5',
    userId: 'owner-1',
    triggerKind: 'schedule',
    configJson: {
      intervalMs: 1000,
      timezone: 'Asia/Shanghai',
      misfireStrategy: 'skip',
    },
  });
  assert.equal(createScheduleTrigger.status, 201);
  const scheduleTriggerId = createScheduleTrigger.json.triggerBinding.triggerBindingId;

  const enableScheduleTrigger = await httpPost(
    `http://127.0.0.1:${ports.platform}/v1/trigger-bindings/${scheduleTriggerId}/enable`,
    {
      schemaVersion: 'v1',
      userId: 'owner-1',
    },
  );
  assert.equal(enableScheduleTrigger.status, 202);

  const approveScheduleTrigger = await httpPost(
    `http://127.0.0.1:${ports.platform}/v1/governance-change-requests/${enableScheduleTrigger.json.governanceRequest.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'approver-1',
    },
  );
  assert.equal(approveScheduleTrigger.status, 200);
  assert.equal(approveScheduleTrigger.json.triggerBinding.status, 'enabled');

  const dueScheduleTriggers = await httpGet(
    `http://127.0.0.1:${ports.platform}/internal/trigger-bindings/due?timestampMs=${Date.now() + 5000}`,
  );
  assert.equal(dueScheduleTriggers.status, 200);
  assert.ok(dueScheduleTriggers.json.triggers.some((trigger) => trigger.triggerBindingId === scheduleTriggerId));

  const suspendAgent = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/suspend`, {
    schemaVersion: 'v1',
    userId: 'owner-1',
  });
  assert.equal(suspendAgent.status, 200);
  assert.equal(suspendAgent.json.agent.activationState, 'suspended');

  const triggerBindingsWhileSuspended = await httpGet(
    `http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/trigger-bindings`,
  );
  assert.equal(triggerBindingsWhileSuspended.status, 200);
  const suspendedScheduleTrigger = triggerBindingsWhileSuspended.json.triggerBindings.find(
    (trigger) => trigger.triggerBindingId === scheduleTriggerId,
  );
  assert.ok(suspendedScheduleTrigger);
  assert.equal(suspendedScheduleTrigger.status, 'enabled');
  assert.equal(suspendedScheduleTrigger.nextTriggerAt, undefined);

  const dueWhileSuspended = await httpGet(
    `http://127.0.0.1:${ports.platform}/internal/trigger-bindings/due?timestampMs=${Date.now() + 60_000}`,
  );
  assert.equal(dueWhileSuspended.status, 200);
  assert.ok(dueWhileSuspended.json.triggers.every((trigger) => trigger.triggerBindingId !== scheduleTriggerId));

  const reactivateAgent = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/activate`, {
    schemaVersion: 'v1',
    userId: 'owner-1',
    summary: 'Resume the long-running agent',
  });
  assert.equal(reactivateAgent.status, 202);

  const approveReactivation = await httpPost(
    `http://127.0.0.1:${ports.platform}/v1/governance-change-requests/${reactivateAgent.json.governanceRequest.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'approver-1',
    },
  );
  assert.equal(approveReactivation.status, 200);
  assert.equal(approveReactivation.json.agent.activationState, 'active');

  const triggerBindingsAfterResume = await httpGet(
    `http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/trigger-bindings`,
  );
  assert.equal(triggerBindingsAfterResume.status, 200);
  const resumedScheduleTrigger = triggerBindingsAfterResume.json.triggerBindings.find(
    (trigger) => trigger.triggerBindingId === scheduleTriggerId,
  );
  assert.ok(resumedScheduleTrigger);
  assert.ok(typeof resumedScheduleTrigger.nextTriggerAt === 'number');

  const dueAfterResume = await httpGet(
    `http://127.0.0.1:${ports.platform}/internal/trigger-bindings/due?timestampMs=${resumedScheduleTrigger.nextTriggerAt}`,
  );
  assert.equal(dueAfterResume.status, 200);
  assert.ok(dueAfterResume.json.triggers.some((trigger) => trigger.triggerBindingId === scheduleTriggerId));

  const dispatchSchedule = await httpPost(
    `http://127.0.0.1:${ports.platform}/internal/trigger-bindings/${scheduleTriggerId}/dispatch`,
    {
      schemaVersion: 'v1',
      dispatchKey: `schedule:${scheduleTriggerId}:1`,
      firedAt: Date.now() + 1000,
      payload: { scheduledFor: 'now' },
      headers: { 'x-uniassist-trigger-source': 'test' },
    },
  );
  assert.equal(dispatchSchedule.status, 202);
  assert.equal(dispatchSchedule.json.duplicate, false);
  assert.equal(runtimeStartRequests.length, 2);
  assert.equal(runtimeStartRequests[1].sourceType, 'schedule');

  const dispatchScheduleDuplicate = await httpPost(
    `http://127.0.0.1:${ports.platform}/internal/trigger-bindings/${scheduleTriggerId}/dispatch`,
    {
      schemaVersion: 'v1',
      dispatchKey: `schedule:${scheduleTriggerId}:1`,
      firedAt: Date.now() + 1000,
      payload: { scheduledFor: 'now' },
      headers: { 'x-uniassist-trigger-source': 'test' },
    },
  );
  assert.equal(dispatchScheduleDuplicate.status, 202);
  assert.equal(dispatchScheduleDuplicate.json.duplicate, true);
  assert.equal(runtimeStartRequests.length, 2);

  const createCronTrigger = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/trigger-bindings`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b5',
    userId: 'owner-1',
    triggerKind: 'schedule',
    configJson: {
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      misfireStrategy: 'skip',
    },
  });
  assert.equal(createCronTrigger.status, 201);
  const cronTriggerId = createCronTrigger.json.triggerBinding.triggerBindingId;

  const enableCronTrigger = await httpPost(
    `http://127.0.0.1:${ports.platform}/v1/trigger-bindings/${cronTriggerId}/enable`,
    {
      schemaVersion: 'v1',
      userId: 'owner-1',
    },
  );
  assert.equal(enableCronTrigger.status, 202);

  const approveCronTrigger = await httpPost(
    `http://127.0.0.1:${ports.platform}/v1/governance-change-requests/${enableCronTrigger.json.governanceRequest.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'approver-1',
    },
  );
  assert.equal(approveCronTrigger.status, 200);
  assert.equal(approveCronTrigger.json.triggerBinding.status, 'enabled');
  assert.ok(typeof approveCronTrigger.json.triggerBinding.nextTriggerAt === 'number');
  assert.equal(approveCronTrigger.json.triggerBinding.nextTriggerAt % 60000, 0);
  const firstCronNextTriggerAt = approveCronTrigger.json.triggerBinding.nextTriggerAt;
  const firstCronTime = getZonedHourMinute(firstCronNextTriggerAt, 'Asia/Shanghai');
  assert.equal(firstCronTime.hour, 9);
  assert.equal(firstCronTime.minute, 0);

  const dueCronTriggers = await httpGet(
    `http://127.0.0.1:${ports.platform}/internal/trigger-bindings/due?timestampMs=${firstCronNextTriggerAt}`,
  );
  assert.equal(dueCronTriggers.status, 200);
  assert.ok(dueCronTriggers.json.triggers.some((trigger) => trigger.triggerBindingId === cronTriggerId));

  const dispatchCronSchedule = await httpPost(
    `http://127.0.0.1:${ports.platform}/internal/trigger-bindings/${cronTriggerId}/dispatch`,
    {
      schemaVersion: 'v1',
      dispatchKey: `schedule:${cronTriggerId}:${firstCronNextTriggerAt}`,
      firedAt: firstCronNextTriggerAt,
      payload: { scheduledFor: firstCronNextTriggerAt },
      headers: { 'x-uniassist-trigger-source': 'cron-test' },
    },
  );
  assert.equal(dispatchCronSchedule.status, 202);
  assert.equal(dispatchCronSchedule.json.duplicate, false);
  assert.equal(runtimeStartRequests.length, 3);
  assert.equal(runtimeStartRequests[2].sourceType, 'schedule');

  const triggerBindingsAfterCronDispatch = await httpGet(
    `http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/trigger-bindings`,
  );
  assert.equal(triggerBindingsAfterCronDispatch.status, 200);
  const cronTriggerAfterDispatch = triggerBindingsAfterCronDispatch.json.triggerBindings.find(
    (trigger) => trigger.triggerBindingId === cronTriggerId,
  );
  assert.ok(cronTriggerAfterDispatch);
  assert.ok(cronTriggerAfterDispatch.nextTriggerAt > firstCronNextTriggerAt);
  const secondCronTime = getZonedHourMinute(cronTriggerAfterDispatch.nextTriggerAt, 'Asia/Shanghai');
  assert.equal(secondCronTime.hour, 9);
  assert.equal(secondCronTime.minute, 0);

  const createEventSubscription = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/trigger-bindings`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b5',
    userId: 'owner-1',
    triggerKind: 'event_subscription',
    configJson: {
      topic: 'student.updated',
    },
  });
  assert.equal(createEventSubscription.status, 201);

  const enableEventSubscription = await httpPost(
    `http://127.0.0.1:${ports.platform}/v1/trigger-bindings/${createEventSubscription.json.triggerBinding.triggerBindingId}/enable`,
    {
      schemaVersion: 'v1',
      userId: 'owner-1',
    },
  );
  assert.equal(enableEventSubscription.status, 409);
  assert.equal(enableEventSubscription.json.code, 'EVENT_SUBSCRIPTION_NOT_AVAILABLE_IN_B5');

  const listScopeGrants = await httpGet(`http://127.0.0.1:${ports.platform}/v1/scope-grants`);
  assert.equal(listScopeGrants.status, 200);
  assert.ok(listScopeGrants.json.scopeGrants.some((grant) => grant.resourceRef === secretRefId));

  const retireAgent = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/retire`, {
    schemaVersion: 'v1',
    userId: 'owner-1',
  });
  assert.equal(retireAgent.status, 200);
  assert.equal(retireAgent.json.agent.activationState, 'retired');

  const triggerBindingsAfterRetire = await httpGet(
    `http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/trigger-bindings`,
  );
  assert.equal(triggerBindingsAfterRetire.status, 200);
  const retiredScheduleTrigger = triggerBindingsAfterRetire.json.triggerBindings.find(
    (trigger) => trigger.triggerBindingId === scheduleTriggerId,
  );
  const retiredCronTrigger = triggerBindingsAfterRetire.json.triggerBindings.find(
    (trigger) => trigger.triggerBindingId === cronTriggerId,
  );
  assert.ok(retiredScheduleTrigger);
  assert.ok(retiredCronTrigger);
  assert.equal(retiredScheduleTrigger.nextTriggerAt, undefined);
  assert.equal(retiredCronTrigger.nextTriggerAt, undefined);

  const dueAfterRetire = await httpGet(
    `http://127.0.0.1:${ports.platform}/internal/trigger-bindings/due?timestampMs=${Date.now() + 60_000}`,
  );
  assert.equal(dueAfterRetire.status, 200);
  assert.ok(dueAfterRetire.json.triggers.every((trigger) => trigger.triggerBindingId !== scheduleTriggerId));
  assert.ok(dueAfterRetire.json.triggers.every((trigger) => trigger.triggerBindingId !== cronTriggerId));
});
