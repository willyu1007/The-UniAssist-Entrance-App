import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ports = {
  runtime: 9995,
  platform: 9994,
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
          executorId: 'connector-runtime',
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

test('workflow platform api manages B7 connector governance and event subscription dispatch', async (t) => {
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
        res.end(JSON.stringify(buildRuntimeRunResponse(body, `run-b7-${runtimeCounter}`)));
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found', code: 'NOT_FOUND' }));
    });
  });

  await new Promise((resolvePromise) => runtimeServer.listen(ports.runtime, resolvePromise));

  const platform = startService('platform-b7', ['--filter', '@baseinterface/workflow-platform-api', 'start'], {
    PORT: String(ports.platform),
    UNIASSIST_WORKFLOW_RUNTIME_BASE_URL: `http://127.0.0.1:${ports.runtime}`,
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
  });

  t.after(() => {
    platform.kill('SIGTERM');
    runtimeServer.close();
  });

  await waitForHealth(`http://127.0.0.1:${ports.platform}/health`);

  const sessionId = 'session-b7';
  const userId = 'owner-b7';
  const workspaceId = 'workspace-b7';

  const createDraft = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
    workflowKey: 'b7-connector-flow',
    name: 'B7 Connector Flow',
  });
  assert.equal(createDraft.status, 201);
  const draftId = createDraft.json.draft.draftId;

  const draftDetail = await httpGet(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}?sessionId=${encodeURIComponent(sessionId)}`);
  assert.equal(draftDetail.status, 200);
  const baseRevisionId = draftDetail.json.revisions.at(-1).revisionId;

  const patchMetadata = await httpPatch(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/spec`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
    baseRevisionId,
    changeSummary: 'Set compat provider metadata',
    patch: {
      section: 'metadata',
      value: {
        compatProviderId: 'sample',
      },
    },
  });
  assert.equal(patchMetadata.status, 200);

  const patchNodes = await httpPatch(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/spec`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
    baseRevisionId: patchMetadata.json.revision.revisionId,
    changeSummary: 'Convert workflow to connector executor',
    patch: {
      section: 'nodes',
      value: {
        entryNode: 'start_pipeline',
        nodes: [
          {
            nodeKey: 'start_pipeline',
            nodeType: 'executor',
            executorId: 'connector-runtime',
            config: {
              actionRef: 'pipeline_start',
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
      },
    },
  });
  assert.equal(patchNodes.status, 200);

  const validateDraft = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/validate`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
  });
  assert.equal(validateDraft.status, 200);
  assert.equal(validateDraft.json.draft.publishable, true);

  const publishDraft = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/publish`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
  });
  assert.equal(publishDraft.status, 200);
  const templateVersionId = publishDraft.json.version.templateVersionId;

  const createAgent = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents`, {
    schemaVersion: 'v1',
    workspaceId,
    templateVersionRef: templateVersionId,
    name: 'Connector Agent',
    createdBy: userId,
    ownerActorRef: userId,
    riskLevel: 'R1',
  });
  assert.equal(createAgent.status, 201);
  const agentId = createAgent.json.agent.agentId;

  const activateAgent = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/activate`, {
    schemaVersion: 'v1',
    userId,
    summary: 'Activate connector agent',
  });
  assert.equal(activateAgent.status, 202);

  const approveActivate = await httpPost(
    `http://127.0.0.1:${ports.platform}/v1/governance-change-requests/${activateAgent.json.governanceRequest.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'governance-board',
      comment: 'approved',
    },
  );
  assert.equal(approveActivate.status, 200);
  assert.equal(approveActivate.json.agent.activationState, 'active');

  const createConnectorDefinition = await httpPost(`http://127.0.0.1:${ports.platform}/v1/connector-definitions`, {
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
  assert.equal(createConnectorDefinition.status, 201);
  const connectorDefinitionId = createConnectorDefinition.json.connectorDefinition.connectorDefinitionId;

  const createSecretRef = await httpPost(`http://127.0.0.1:${ports.platform}/v1/secret-refs`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    environmentScope: '*',
    providerType: 'webhook_hmac',
    metadataJson: {
      envKey: 'CI_PIPELINE_SHARED_SECRET',
    },
  });
  assert.equal(createSecretRef.status, 201);
  const secretRefId = createSecretRef.json.secretRef.secretRefId;

  const createConnectorBinding = await httpPost(`http://127.0.0.1:${ports.platform}/v1/connector-bindings`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    connectorDefinitionId,
    name: 'CI Pipeline Binding',
    secretRefId,
  });
  assert.equal(createConnectorBinding.status, 201);
  const connectorBindingId = createConnectorBinding.json.connectorBinding.connectorBindingId;

  async function createEnabledEventSubscription() {
    const createEventTrigger = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/trigger-bindings`, {
      schemaVersion: 'v1',
      workspaceId,
      userId,
      triggerKind: 'event_subscription',
      configJson: {},
    });
    assert.equal(createEventTrigger.status, 201);
    const triggerBindingId = createEventTrigger.json.triggerBinding.triggerBindingId;

    const createEventSubscription = await httpPost(`http://127.0.0.1:${ports.platform}/v1/event-subscriptions`, {
      schemaVersion: 'v1',
      workspaceId,
      userId,
      connectorBindingId,
      triggerBindingId,
      eventType: 'pipeline.finished',
      configJson: {
        replayWindowMs: 60_000,
      },
    });
    assert.equal(createEventSubscription.status, 201);
    const publicSubscriptionKey = createEventSubscription.json.eventSubscription.publicSubscriptionKey;

    const enableEventTrigger = await httpPost(`http://127.0.0.1:${ports.platform}/v1/trigger-bindings/${triggerBindingId}/enable`, {
      schemaVersion: 'v1',
      userId,
      summary: 'Enable connector event trigger',
    });
    assert.equal(enableEventTrigger.status, 202);

    const approveEventTrigger = await httpPost(
      `http://127.0.0.1:${ports.platform}/v1/governance-change-requests/${enableEventTrigger.json.governanceRequest.requestId}/approve`,
      {
        schemaVersion: 'v1',
        actorRef: 'governance-board',
        comment: 'approved',
      },
    );
    assert.equal(approveEventTrigger.status, 200);
    assert.equal(approveEventTrigger.json.triggerBinding.status, 'enabled');

    return {
      triggerBindingId,
      publicSubscriptionKey,
    };
  }

  const createActionBinding = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/action-bindings`, {
    schemaVersion: 'v1',
    workspaceId,
    userId,
    actionRef: 'pipeline_start',
    connectorBindingId,
    capabilityId: 'pipeline.start',
    sideEffectClass: 'write',
    executionMode: 'async',
    browserFallbackMode: 'disabled',
    configJson: {
      pipeline: 'sample',
    },
  });
  assert.equal(createActionBinding.status, 201);
  const actionBindingId = createActionBinding.json.actionBinding.actionBindingId;

  const startWithoutPolicy = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/runs`, {
    schemaVersion: 'v1',
    traceId: 'trace-b7-no-policy',
    sessionId,
    userId,
    inputPayload: {
      ref: 'main',
    },
  });
  assert.equal(startWithoutPolicy.status, 409);
  assert.equal(startWithoutPolicy.json.code, 'EXTERNAL_WRITE_ALLOW_REQUIRED');

  const createPolicyBinding = await httpPost(`http://127.0.0.1:${ports.platform}/v1/policy-bindings`, {
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
  assert.equal(createPolicyBinding.status, 201);
  const policyBindingId = createPolicyBinding.json.policyBinding.policyBindingId;

  const createExternalWriteRequest = await httpPost(`http://127.0.0.1:${ports.platform}/v1/governance-change-requests`, {
    schemaVersion: 'v1',
    workspaceId,
    requestKind: 'external_write_allow',
    targetType: 'action_binding',
    targetRef: actionBindingId,
    requestedByActorId: userId,
    riskLevel: 'R1',
    summary: 'Approve external write for pipeline action',
    desiredStateJson: {
      policyBindingId,
    },
  });
  assert.equal(createExternalWriteRequest.status, 201);

  const approveExternalWrite = await httpPost(
    `http://127.0.0.1:${ports.platform}/v1/governance-change-requests/${createExternalWriteRequest.json.request.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'governance-board',
      comment: 'approved',
    },
  );
  assert.equal(approveExternalWrite.status, 200);
  assert.equal(approveExternalWrite.json.policyBinding.status, 'active');

  const { publicSubscriptionKey } = await createEnabledEventSubscription();

  const runtimeConfigWithoutScope = await httpGet(
    `http://127.0.0.1:${ports.platform}/internal/event-subscriptions/${publicSubscriptionKey}/runtime-config`,
  );
  assert.equal(runtimeConfigWithoutScope.status, 409);
  assert.equal(runtimeConfigWithoutScope.json.code, 'CONNECTOR_SECRET_SCOPE_REQUIRED');

  const startWithoutScopeGrant = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/runs`, {
    schemaVersion: 'v1',
    traceId: 'trace-b7-no-scope',
    sessionId,
    userId,
    inputPayload: {
      ref: 'main',
    },
  });
  assert.equal(startWithoutScopeGrant.status, 409);
  assert.equal(startWithoutScopeGrant.json.code, 'CONNECTOR_SECRET_SCOPE_REQUIRED');

  const createScopeGrantRequest = await httpPost(`http://127.0.0.1:${ports.platform}/v1/governance-change-requests`, {
    schemaVersion: 'v1',
    workspaceId,
    requestKind: 'scope_grant_issue',
    targetType: 'connector_binding',
    targetRef: connectorBindingId,
    requestedByActorId: userId,
    riskLevel: 'R1',
    summary: 'Grant connector binding access to the shared secret',
    desiredStateJson: {
      resourceType: 'secret_ref',
      resourceRef: secretRefId,
      scopeJson: {
        actions: ['invoke_connector', 'receive_events'],
      },
    },
  });
  assert.equal(createScopeGrantRequest.status, 201);

  const approveScopeGrant = await httpPost(
    `http://127.0.0.1:${ports.platform}/v1/governance-change-requests/${createScopeGrantRequest.json.request.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'governance-board',
      comment: 'approved',
    },
  );
  assert.equal(approveScopeGrant.status, 200);
  assert.equal(approveScopeGrant.json.scopeGrant.status, 'active');

  const runtimeConfig = await httpGet(
    `http://127.0.0.1:${ports.platform}/internal/event-subscriptions/${publicSubscriptionKey}/runtime-config`,
  );
  assert.equal(runtimeConfig.status, 200);
  assert.equal(runtimeConfig.json.eventSubscription.connectorKey, 'ci_pipeline');
  assert.equal(runtimeConfig.json.eventSubscription.eventType, 'pipeline.finished');

  const startWithPolicy = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/runs`, {
    schemaVersion: 'v1',
    traceId: 'trace-b7-start',
    sessionId,
    userId,
    inputPayload: {
      ref: 'main',
    },
  });
  assert.equal(startWithPolicy.status, 201);
  assert.equal(runtimeStartRequests.length, 1);
  assert.equal(runtimeStartRequests[0].connectorActions.pipeline_start.connectorKey, 'ci_pipeline');
  assert.equal(runtimeStartRequests[0].connectorActions.pipeline_start.capabilityId, 'pipeline.start');

  const secondSubscription = await createEnabledEventSubscription();

  const dispatchEvent = await httpPost(
    `http://127.0.0.1:${ports.platform}/internal/event-subscriptions/${publicSubscriptionKey}/dispatch`,
    {
      schemaVersion: 'v1',
      dispatchKey: 'event-001',
      firedAt: Date.now(),
      payload: {
        pipelineRef: 'pipeline:run-1',
        status: 'passed',
      },
      headers: {
        'x-event-id': 'event-001',
      },
    },
  );
  assert.equal(dispatchEvent.status, 202);
  assert.equal(dispatchEvent.json.duplicate, false);
  assert.equal(runtimeStartRequests.length, 2);
  assert.equal(runtimeStartRequests[1].sourceType, 'event_subscription');
  assert.equal(runtimeStartRequests[1].connectorActions.pipeline_start.connectorKey, 'ci_pipeline');

  const duplicateDispatch = await httpPost(
    `http://127.0.0.1:${ports.platform}/internal/event-subscriptions/${publicSubscriptionKey}/dispatch`,
    {
      schemaVersion: 'v1',
      dispatchKey: 'event-001',
      firedAt: Date.now(),
      payload: {
        pipelineRef: 'pipeline:run-1',
        status: 'passed',
      },
      headers: {
        'x-event-id': 'event-001',
      },
    },
  );
  assert.equal(duplicateDispatch.status, 202);
  assert.equal(duplicateDispatch.json.duplicate, true);
  assert.equal(runtimeStartRequests.length, 2);

  const secondDispatch = await httpPost(
    `http://127.0.0.1:${ports.platform}/internal/event-subscriptions/${secondSubscription.publicSubscriptionKey}/dispatch`,
    {
      schemaVersion: 'v1',
      dispatchKey: 'event-001',
      firedAt: Date.now(),
      payload: {
        pipelineRef: 'pipeline:run-1',
        status: 'passed',
      },
      headers: {
        'x-event-id': 'event-001',
      },
    },
  );
  assert.equal(secondDispatch.status, 202);
  assert.equal(secondDispatch.json.duplicate, false);
  assert.equal(runtimeStartRequests.length, 3);
  assert.equal(runtimeStartRequests[2].sourceType, 'event_subscription');
});
