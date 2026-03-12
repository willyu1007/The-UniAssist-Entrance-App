import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ports = {
  runtime: 9993,
  platform: 9992,
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

function loadJson(relativePath) {
  return JSON.parse(readFileSync(resolve(rootDir, relativePath), 'utf8'));
}

function buildRuntimeRunResponse(body, runId) {
  const timestamp = Date.now();
  const entryNode = body.version?.spec?.entryNode || 'start';
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
        currentNodeRunId: `${runId}:node`,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      nodeRuns: [
        {
          nodeRunId: `${runId}:node`,
          runId,
          nodeKey: entryNode,
          nodeType: 'executor',
          status: 'running',
          executorId: body.version?.spec?.nodes?.find((node) => node.nodeKey === entryNode)?.executorId || 'connector-runtime',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      approvals: [],
      approvalDecisions: [],
      artifacts: [],
    },
    events: [],
  };
}

function buildPrimaryNodes() {
  return {
    entryNode: 'capture_change_intent',
    nodes: [
      {
        nodeKey: 'capture_change_intent',
        nodeType: 'executor',
        executorId: 'compat-sample',
        transitions: {
          success: 'synthesize_execution_plan',
        },
      },
      {
        nodeKey: 'synthesize_execution_plan',
        nodeType: 'executor',
        executorId: 'compat-sample',
        transitions: {
          success: 'risk_review',
        },
      },
      {
        nodeKey: 'risk_review',
        nodeType: 'approval_gate',
        config: {
          reviewArtifactTypes: ['ChangeIntent', 'ExecutionPlan'],
        },
        transitions: {
          approved: 'issue_upsert',
        },
      },
      {
        nodeKey: 'issue_upsert',
        nodeType: 'executor',
        executorId: 'connector-runtime',
        config: {
          actionRef: 'issue_upsert',
        },
        transitions: {
          success: 'change_review_upsert',
        },
      },
      {
        nodeKey: 'change_review_upsert',
        nodeType: 'executor',
        executorId: 'connector-runtime',
        config: {
          actionRef: 'change_review_upsert',
        },
        transitions: {
          success: 'pipeline_start',
        },
      },
      {
        nodeKey: 'pipeline_start',
        nodeType: 'executor',
        executorId: 'connector-runtime',
        config: {
          actionRef: 'pipeline_start',
        },
        transitions: {
          success: 'summarize_delivery',
        },
      },
      {
        nodeKey: 'summarize_delivery',
        nodeType: 'executor',
        executorId: 'compat-sample',
        transitions: {
          success: 'finish',
        },
      },
      {
        nodeKey: 'finish',
        nodeType: 'end',
      },
    ],
  };
}

function buildCompanionNodes() {
  return {
    entryNode: 'capture_validation_signal',
    nodes: [
      {
        nodeKey: 'capture_validation_signal',
        nodeType: 'executor',
        executorId: 'compat-sample',
        transitions: {
          success: 'issue_upsert',
        },
      },
      {
        nodeKey: 'issue_upsert',
        nodeType: 'executor',
        executorId: 'connector-runtime',
        config: {
          actionRef: 'issue_upsert',
        },
        transitions: {
          success: 'finish',
        },
      },
      {
        nodeKey: 'finish',
        nodeType: 'end',
      },
    ],
  };
}

async function publishWorkflow(platformBaseUrl, { sessionId, userId, workflowKey, name, nodes }) {
  const createDraft = await httpPost(`${platformBaseUrl}/v1/workflow-drafts`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
    workflowKey,
    name,
  });
  assert.equal(createDraft.status, 201);
  const draftId = createDraft.json.draft.draftId;

  const detail = await httpGet(`${platformBaseUrl}/v1/workflow-drafts/${draftId}?sessionId=${encodeURIComponent(sessionId)}`);
  assert.equal(detail.status, 200);

  const patchMetadata = await httpPatch(`${platformBaseUrl}/v1/workflow-drafts/${draftId}/spec`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
    baseRevisionId: detail.json.revisions.at(-1).revisionId,
    changeSummary: 'Set compat provider metadata',
    patch: {
      section: 'metadata',
      value: {
        compatProviderId: 'sample',
      },
    },
  });
  assert.equal(patchMetadata.status, 200);

  const patchNodes = await httpPatch(`${platformBaseUrl}/v1/workflow-drafts/${draftId}/spec`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
    baseRevisionId: patchMetadata.json.revision.revisionId,
    changeSummary: 'Apply canonical B8 workflow nodes',
    patch: {
      section: 'nodes',
      value: nodes,
    },
  });
  assert.equal(patchNodes.status, 200);

  const validate = await httpPost(`${platformBaseUrl}/v1/workflow-drafts/${draftId}/validate`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
  });
  assert.equal(validate.status, 200);
  assert.equal(validate.json.draft.publishable, true);

  const publish = await httpPost(`${platformBaseUrl}/v1/workflow-drafts/${draftId}/publish`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
  });
  assert.equal(publish.status, 200);
  return publish.json.version.templateVersionId;
}

async function createAndActivateAgent(platformBaseUrl, {
  workspaceId,
  templateVersionRef,
  userId,
  name,
}) {
  const created = await httpPost(`${platformBaseUrl}/v1/agents`, {
    schemaVersion: 'v1',
    workspaceId,
    templateVersionRef,
    name,
    createdBy: userId,
    ownerActorRef: userId,
    riskLevel: 'R1',
  });
  assert.equal(created.status, 201);
  const agentId = created.json.agent.agentId;

  const activate = await httpPost(`${platformBaseUrl}/v1/agents/${agentId}/activate`, {
    schemaVersion: 'v1',
    userId,
    summary: `Activate ${name}`,
  });
  assert.equal(activate.status, 202);

  const approved = await httpPost(
    `${platformBaseUrl}/v1/governance-change-requests/${activate.json.governanceRequest.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'governance-board',
      comment: 'approved',
    },
  );
  assert.equal(approved.status, 200);
  assert.equal(approved.json.agent.activationState, 'active');
  return agentId;
}

async function approveExternalWrite(platformBaseUrl, {
  workspaceId,
  userId,
  actionBindingId,
  summary,
}) {
  const policy = await httpPost(`${platformBaseUrl}/v1/policy-bindings`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    policyKind: 'invoke',
    targetType: 'action_binding',
    targetRef: actionBindingId,
    configJson: {
      allowWrite: true,
    },
  });
  assert.equal(policy.status, 201);

  const request = await httpPost(`${platformBaseUrl}/v1/governance-change-requests`, {
    schemaVersion: 'v1',
    workspaceId,
    requestKind: 'external_write_allow',
    targetType: 'action_binding',
    targetRef: actionBindingId,
    requestedByActorId: userId,
    riskLevel: 'R1',
    summary,
    desiredStateJson: {
      policyBindingId: policy.json.policyBinding.policyBindingId,
    },
  });
  assert.equal(request.status, 201);

  const approved = await httpPost(
    `${platformBaseUrl}/v1/governance-change-requests/${request.json.request.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'governance-board',
      comment: 'approved',
    },
  );
  assert.equal(approved.status, 200);
}

test('workflow platform api manages B8 primary and companion R&D collaboration flows', async (t) => {
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

      if (req.url === '/internal/runtime/start-run' && req.method === 'POST') {
        runtimeCounter += 1;
        runtimeStartRequests.push(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(buildRuntimeRunResponse(body, `run-b8-${runtimeCounter}`)));
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found', code: 'NOT_FOUND' }));
    });
  });

  await new Promise((resolvePromise) => runtimeServer.listen(ports.runtime, resolvePromise));

  const platform = startService('platform-b8', ['--filter', '@baseinterface/workflow-platform-api', 'start'], {
    PORT: String(ports.platform),
    UNIASSIST_WORKFLOW_RUNTIME_BASE_URL: `http://127.0.0.1:${ports.runtime}`,
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
  });

  t.after(() => {
    platform.kill('SIGTERM');
    runtimeServer.close();
  });

  await waitForHealth(`http://127.0.0.1:${ports.platform}/health`);

  const platformBaseUrl = `http://127.0.0.1:${ports.platform}`;
  const sessionId = 'session-b8';
  const userId = 'owner-b8';
  const workspaceId = 'workspace-b8';

  const primaryTemplateVersionId = await publishWorkflow(platformBaseUrl, {
    sessionId,
    userId,
    workflowKey: 'sample-b8-rnd-collab',
    name: 'B8 Primary R&D Flow',
    nodes: buildPrimaryNodes(),
  });
  const companionTemplateVersionId = await publishWorkflow(platformBaseUrl, {
    sessionId,
    userId,
    workflowKey: 'sample-b8-rnd-collab-event',
    name: 'B8 Companion Event Flow',
    nodes: buildCompanionNodes(),
  });

  const primaryAgentId = await createAndActivateAgent(platformBaseUrl, {
    workspaceId,
    templateVersionRef: primaryTemplateVersionId,
    userId,
    name: 'B8 Primary Agent',
  });
  const companionAgentId = await createAndActivateAgent(platformBaseUrl, {
    workspaceId,
    templateVersionRef: companionTemplateVersionId,
    userId,
    name: 'B8 Companion Agent',
  });

  const issueDefinition = await httpPost(`${platformBaseUrl}/v1/connector-definitions`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    connectorKey: 'issue_tracker',
    name: 'Issue Tracker Sample',
    catalogJson: {
      actions: [
        {
          capabilityId: 'issue.upsert',
          name: 'Upsert Issue',
          executionMode: 'sync',
          sideEffectClass: 'write',
          supportsBrowserFallback: false,
        },
      ],
      events: [],
    },
  });
  assert.equal(issueDefinition.status, 201);

  const sourceControlDefinition = await httpPost(`${platformBaseUrl}/v1/connector-definitions`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    connectorKey: 'source_control',
    name: 'Source Control Sample',
    catalogJson: {
      actions: [
        {
          capabilityId: 'change_review.upsert',
          name: 'Upsert Change Review',
          executionMode: 'sync',
          sideEffectClass: 'write',
          supportsBrowserFallback: false,
        },
      ],
      events: [],
    },
  });
  assert.equal(sourceControlDefinition.status, 201);

  const ciDefinition = await httpPost(`${platformBaseUrl}/v1/connector-definitions`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    connectorKey: 'ci_pipeline',
    name: 'CI Pipeline Sample',
    catalogJson: {
      actions: [
        {
          capabilityId: 'pipeline.start',
          name: 'Start Pipeline',
          executionMode: 'async',
          sideEffectClass: 'write',
          supportsBrowserFallback: false,
        },
      ],
      events: [
        {
          eventType: 'pipeline.finished',
          deliveryMode: 'webhook',
        },
      ],
    },
  });
  assert.equal(ciDefinition.status, 201);

  const issueBinding = await httpPost(`${platformBaseUrl}/v1/connector-bindings`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    connectorDefinitionId: issueDefinition.json.connectorDefinition.connectorDefinitionId,
    name: 'Issue Binding',
  });
  assert.equal(issueBinding.status, 201);

  const sourceControlBinding = await httpPost(`${platformBaseUrl}/v1/connector-bindings`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    connectorDefinitionId: sourceControlDefinition.json.connectorDefinition.connectorDefinitionId,
    name: 'Source Control Binding',
  });
  assert.equal(sourceControlBinding.status, 201);

  const ciActionBinding = await httpPost(`${platformBaseUrl}/v1/connector-bindings`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    connectorDefinitionId: ciDefinition.json.connectorDefinition.connectorDefinitionId,
    name: 'CI Action Binding',
  });
  assert.equal(ciActionBinding.status, 201);

  const secretRef = await httpPost(`${platformBaseUrl}/v1/secret-refs`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    environmentScope: '*',
    providerType: 'webhook_hmac',
    metadataJson: {
      envKey: 'CI_PIPELINE_SHARED_SECRET',
    },
  });
  assert.equal(secretRef.status, 201);

  const ciEventBinding = await httpPost(`${platformBaseUrl}/v1/connector-bindings`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    connectorDefinitionId: ciDefinition.json.connectorDefinition.connectorDefinitionId,
    name: 'CI Event Binding',
    secretRefId: secretRef.json.secretRef.secretRefId,
  });
  assert.equal(ciEventBinding.status, 201);

  const primaryIssueAction = await httpPost(`${platformBaseUrl}/v1/agents/${primaryAgentId}/action-bindings`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    actionRef: 'issue_upsert',
    connectorBindingId: issueBinding.json.connectorBinding.connectorBindingId,
    capabilityId: 'issue.upsert',
    sideEffectClass: 'write',
    executionMode: 'sync',
    browserFallbackMode: 'disabled',
    configJson: {},
  });
  assert.equal(primaryIssueAction.status, 201);

  const primaryChangeReviewAction = await httpPost(`${platformBaseUrl}/v1/agents/${primaryAgentId}/action-bindings`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    actionRef: 'change_review_upsert',
    connectorBindingId: sourceControlBinding.json.connectorBinding.connectorBindingId,
    capabilityId: 'change_review.upsert',
    sideEffectClass: 'write',
    executionMode: 'sync',
    browserFallbackMode: 'disabled',
    configJson: {},
  });
  assert.equal(primaryChangeReviewAction.status, 201);

  const primaryPipelineAction = await httpPost(`${platformBaseUrl}/v1/agents/${primaryAgentId}/action-bindings`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    actionRef: 'pipeline_start',
    connectorBindingId: ciActionBinding.json.connectorBinding.connectorBindingId,
    capabilityId: 'pipeline.start',
    sideEffectClass: 'write',
    executionMode: 'async',
    browserFallbackMode: 'disabled',
    configJson: {},
  });
  assert.equal(primaryPipelineAction.status, 201);

  const companionIssueAction = await httpPost(`${platformBaseUrl}/v1/agents/${companionAgentId}/action-bindings`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    actionRef: 'issue_upsert',
    connectorBindingId: issueBinding.json.connectorBinding.connectorBindingId,
    capabilityId: 'issue.upsert',
    sideEffectClass: 'write',
    executionMode: 'sync',
    browserFallbackMode: 'disabled',
    configJson: {},
  });
  assert.equal(companionIssueAction.status, 201);

  const startWithoutPolicies = await httpPost(`${platformBaseUrl}/v1/agents/${primaryAgentId}/runs`, {
    schemaVersion: 'v1',
    traceId: 'trace-b8-no-policy',
    sessionId,
    userId,
    inputPayload: loadJson('docs/scenarios/rnd-collab/canonical-input.json'),
  });
  assert.equal(startWithoutPolicies.status, 409);
  assert.equal(startWithoutPolicies.json.code, 'EXTERNAL_WRITE_ALLOW_REQUIRED');

  await approveExternalWrite(platformBaseUrl, {
    workspaceId,
    userId,
    actionBindingId: primaryIssueAction.json.actionBinding.actionBindingId,
    summary: 'Approve issue tracker write action',
  });
  await approveExternalWrite(platformBaseUrl, {
    workspaceId,
    userId,
    actionBindingId: primaryChangeReviewAction.json.actionBinding.actionBindingId,
    summary: 'Approve source control write action',
  });
  await approveExternalWrite(platformBaseUrl, {
    workspaceId,
    userId,
    actionBindingId: primaryPipelineAction.json.actionBinding.actionBindingId,
    summary: 'Approve pipeline write action',
  });
  await approveExternalWrite(platformBaseUrl, {
    workspaceId,
    userId,
    actionBindingId: companionIssueAction.json.actionBinding.actionBindingId,
    summary: 'Approve companion issue tracker write action',
  });

  const startPrimary = await httpPost(`${platformBaseUrl}/v1/agents/${primaryAgentId}/runs`, {
    schemaVersion: 'v1',
    traceId: 'trace-b8-primary',
    sessionId,
    userId,
    inputPayload: loadJson('docs/scenarios/rnd-collab/canonical-input.json'),
  });
  assert.equal(startPrimary.status, 201);
  assert.equal(runtimeStartRequests.length, 1);
  assert.equal(runtimeStartRequests[0].connectorActions.issue_upsert.connectorKey, 'issue_tracker');
  assert.equal(runtimeStartRequests[0].connectorActions.change_review_upsert.connectorKey, 'source_control');
  assert.equal(runtimeStartRequests[0].connectorActions.pipeline_start.connectorKey, 'ci_pipeline');

  const createEventTrigger = await httpPost(`${platformBaseUrl}/v1/agents/${companionAgentId}/trigger-bindings`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    triggerKind: 'event_subscription',
    configJson: {},
  });
  assert.equal(createEventTrigger.status, 201);
  const triggerBindingId = createEventTrigger.json.triggerBinding.triggerBindingId;

  const createEventSubscription = await httpPost(`${platformBaseUrl}/v1/event-subscriptions`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    connectorBindingId: ciEventBinding.json.connectorBinding.connectorBindingId,
    triggerBindingId,
    eventType: 'pipeline.finished',
    configJson: {
      replayWindowMs: 60_000,
    },
  });
  assert.equal(createEventSubscription.status, 201);
  const publicSubscriptionKey = createEventSubscription.json.eventSubscription.publicSubscriptionKey;

  const enableTrigger = await httpPost(`${platformBaseUrl}/v1/trigger-bindings/${triggerBindingId}/enable`, {
    schemaVersion: 'v1',
    userId,
    summary: 'Enable B8 companion trigger',
  });
  assert.equal(enableTrigger.status, 202);

  const approveTrigger = await httpPost(
    `${platformBaseUrl}/v1/governance-change-requests/${enableTrigger.json.governanceRequest.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'governance-board',
      comment: 'approved',
    },
  );
  assert.equal(approveTrigger.status, 200);

  const runtimeConfigWithoutScope = await httpGet(
    `${platformBaseUrl}/internal/event-subscriptions/${publicSubscriptionKey}/runtime-config`,
  );
  assert.equal(runtimeConfigWithoutScope.status, 409);
  assert.equal(runtimeConfigWithoutScope.json.code, 'CONNECTOR_SECRET_SCOPE_REQUIRED');

  const scopeGrantRequest = await httpPost(`${platformBaseUrl}/v1/governance-change-requests`, {
    schemaVersion: 'v1',
    workspaceId,
    requestKind: 'scope_grant_issue',
    targetType: 'connector_binding',
    targetRef: ciEventBinding.json.connectorBinding.connectorBindingId,
    requestedByActorId: userId,
    riskLevel: 'R1',
    summary: 'Grant event binding access to CI webhook secret',
    desiredStateJson: {
      resourceType: 'secret_ref',
      resourceRef: secretRef.json.secretRef.secretRefId,
      scopeJson: {
        actions: ['invoke_connector', 'receive_events'],
      },
    },
  });
  assert.equal(scopeGrantRequest.status, 201);

  const approveScopeGrant = await httpPost(
    `${platformBaseUrl}/v1/governance-change-requests/${scopeGrantRequest.json.request.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'governance-board',
      comment: 'approved',
    },
  );
  assert.equal(approveScopeGrant.status, 200);

  const runtimeConfig = await httpGet(
    `${platformBaseUrl}/internal/event-subscriptions/${publicSubscriptionKey}/runtime-config`,
  );
  assert.equal(runtimeConfig.status, 200);
  assert.equal(runtimeConfig.json.eventSubscription.connectorKey, 'ci_pipeline');
  assert.equal(runtimeConfig.json.eventSubscription.eventType, 'pipeline.finished');

  const dispatchEvent = await httpPost(
    `${platformBaseUrl}/internal/event-subscriptions/${publicSubscriptionKey}/dispatch`,
    {
      schemaVersion: 'v1',
      dispatchKey: 'pipeline-event-1',
      firedAt: Date.now(),
      payload: loadJson('docs/scenarios/rnd-collab/event-fixture.json'),
      headers: {
        'x-event-id': 'pipeline-event-1',
      },
    },
  );
  assert.equal(dispatchEvent.status, 202);
  assert.equal(dispatchEvent.json.duplicate, false);
  assert.equal(runtimeStartRequests.length, 2);
  assert.equal(runtimeStartRequests[1].sourceType, 'event_subscription');
  assert.equal(runtimeStartRequests[1].connectorActions.issue_upsert.connectorKey, 'issue_tracker');
  assert.equal(runtimeStartRequests[1].inputPayload.input.pipelineRef, 'pipeline:case-1');

  const duplicateDispatch = await httpPost(
    `${platformBaseUrl}/internal/event-subscriptions/${publicSubscriptionKey}/dispatch`,
    {
      schemaVersion: 'v1',
      dispatchKey: 'pipeline-event-1',
      firedAt: Date.now(),
      payload: loadJson('docs/scenarios/rnd-collab/event-fixture.json'),
      headers: {
        'x-event-id': 'pipeline-event-1',
      },
    },
  );
  assert.equal(duplicateDispatch.status, 202);
  assert.equal(duplicateDispatch.json.duplicate, true);
  assert.equal(runtimeStartRequests.length, 2);
});
