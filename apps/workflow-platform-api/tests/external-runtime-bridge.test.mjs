import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ports = {
  bridge: 9984,
  runtime: 9985,
  platform: 9986,
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
    detached: process.platform !== 'win32',
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

function killServiceTree(child, signal) {
  if (!child?.pid) {
    return;
  }
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // fall back to the direct child signal below
    }
  }
  child.kill(signal);
}

async function stopService(child) {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }
  const exited = new Promise((resolvePromise) => {
    child.once('exit', resolvePromise);
  });
  killServiceTree(child, 'SIGTERM');
  await Promise.race([
    exited,
    sleep(3_000).then(() => {
      if (child.exitCode === null) {
        killServiceTree(child, 'SIGKILL');
      }
    }),
  ]);
  if (child.exitCode === null) {
    await exited;
  }
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

function buildRunSnapshot(body, runId, status = 'running') {
  const timestamp = Date.now();
  return {
    schemaVersion: 'v1',
    run: {
      run: {
        runId,
        workflowId: body.template?.workflowId || 'wf-bridge',
        workflowKey: body.template?.workflowKey || 'bridge-flow',
        templateVersionId: body.version?.templateVersionId || 'ver-bridge',
        compatProviderId: body.template?.compatProviderId || 'sample',
        status,
        sessionId: body.sessionId || 'session-bridge',
        userId: body.userId || 'owner-bridge',
        currentNodeRunId: 'node-entry',
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(status === 'cancelled' ? { completedAt: timestamp } : {}),
      },
      nodeRuns: [
        {
          nodeRunId: 'node-entry',
          runId,
          nodeKey: body.version?.spec?.entryNode || 'collect',
          nodeType: 'executor',
          status,
          executorId: 'compat-sample',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      approvals: [],
      approvalDecisions: [],
      artifacts: [],
      actorProfiles: [],
      actorMemberships: [],
      audienceSelectors: [],
      deliverySpecs: [],
      deliveryTargets: [],
    },
    events: [
      {
        schemaVersion: 'v1',
        eventId: `event-${runId}`,
        traceId: body.traceId || 'trace-bridge',
        runId,
        compatProviderId: body.template?.compatProviderId || 'sample',
        timestampMs: timestamp,
        kind: 'run.lifecycle',
        payload: {
          status,
        },
      },
    ],
  };
}

test('workflow platform api handles B6 external runtime bridge governance and dispatch', async (t) => {
  const runtimeStartRequests = [];
  const runtimeCancelRequests = [];
  const runtimeRuns = new Map();
  const bridgeRequests = [];
  let bridgeMode = 'valid';
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
        const runId = body.externalRuntime ? `run-ext-${runtimeCounter}` : `run-${runtimeCounter}`;
        runtimeRuns.set(runId, body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(buildRunSnapshot(body, runId)));
        return;
      }

      if (req.method === 'POST' && req.url === '/internal/runtime/cancel-run') {
        runtimeCancelRequests.push(body);
        if (!String(body.runId).startsWith('run-ext-')) {
          res.writeHead(409, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'cancel unsupported', code: 'RUN_CANCEL_UNSUPPORTED' }));
          return;
        }
        const original = runtimeRuns.get(body.runId) || {};
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(buildRunSnapshot({
          ...original,
          traceId: body.traceId,
          userId: body.userId,
        }, body.runId, 'cancelled')));
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
        const runId = req.url.split('/').pop();
        const original = runId ? runtimeRuns.get(runId) : undefined;
        if (!original) {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found', code: 'RUN_NOT_FOUND' }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ schemaVersion: 'v1', run: buildRunSnapshot(original, runId).run }));
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found', code: 'NOT_FOUND' }));
    });
  });

  const bridgeServer = createServer((req, res) => {
    bridgeRequests.push({ method: req.method, path: req.url });

    if (req.url === '/health' && req.method === 'GET') {
      if (bridgeMode === 'invalid-health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          schemaVersion: 'v1',
          status: 'ok',
          checkedAt: 'not-a-timestamp',
        }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        schemaVersion: 'v1',
        status: 'ok',
        checkedAt: Date.now(),
      }));
      return;
    }

    if (req.url === '/manifest' && req.method === 'GET') {
      if (bridgeMode === 'invalid-manifest') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          schemaVersion: 'v1',
          bridgeVersion: '0.1.0',
          runtimeType: 'external_agent_runtime',
          displayName: 'Stub Bridge',
          callbackMode: 'async_webhook',
          supportsResume: true,
          supportsCancel: 'yes',
          capabilities: {},
        }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        schemaVersion: 'v1',
        bridgeVersion: '0.1.0',
        runtimeType: 'external_agent_runtime',
        displayName: 'Stub Bridge',
        callbackMode: 'async_webhook',
        supportsResume: true,
        supportsCancel: true,
        capabilities: [
          {
            capabilityId: 'compat-sample',
            name: 'Stub capability',
            supportsResume: true,
            supportsCancel: true,
            supportsApproval: true,
          },
        ],
      }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found', code: 'NOT_FOUND' }));
  });

  await new Promise((resolvePromise) => runtimeServer.listen(ports.runtime, resolvePromise));
  await new Promise((resolvePromise) => bridgeServer.listen(ports.bridge, resolvePromise));

  const platform = startService('platform-b6', ['--filter', '@baseinterface/workflow-platform-api', 'start'], {
    PORT: String(ports.platform),
    UNIASSIST_WORKFLOW_RUNTIME_BASE_URL: `http://127.0.0.1:${ports.runtime}`,
    UNIASSIST_WORKFLOW_RUNTIME_PUBLIC_BASE_URL: `http://127.0.0.1:${ports.runtime}`,
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
  });

  t.after(async () => {
    await stopService(platform);
    runtimeServer.close();
    bridgeServer.close();
  });

  await waitForHealth(`http://127.0.0.1:${ports.platform}/health`);

  const createDraft = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts`, {
    schemaVersion: 'v1',
    sessionId: 'session-b6',
    userId: 'owner-bridge',
    workflowKey: 'b6-bridge-workflow',
    name: 'B6 Bridge Workflow',
  });
  assert.equal(createDraft.status, 201);
  const draftId = createDraft.json.draft.draftId;

  const synthesizeDraft = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/synthesize`, {
    schemaVersion: 'v1',
    sessionId: 'session-b6',
    userId: 'owner-bridge',
  });
  assert.equal(synthesizeDraft.status, 200);

  const validateDraft = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/validate`, {
    schemaVersion: 'v1',
    sessionId: 'session-b6',
    userId: 'owner-bridge',
  });
  assert.equal(validateDraft.status, 200);
  assert.equal(validateDraft.json.draft.publishable, true);

  const publishDraft = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/publish`, {
    schemaVersion: 'v1',
    sessionId: 'session-b6',
    userId: 'owner-bridge',
  });
  assert.equal(publishDraft.status, 200);
  const templateVersionId = publishDraft.json.version.templateVersionId;

  const createBridge = await httpPost(`http://127.0.0.1:${ports.platform}/v1/bridge-registrations`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b6',
    userId: 'owner-bridge',
    name: 'Stub Bridge',
    baseUrl: `http://127.0.0.1:${ports.bridge}`,
    serviceId: 'executor-bridge-sample',
  });
  assert.equal(createBridge.status, 201);
  assert.equal(createBridge.json.bridge.status, 'registered');
  const bridgeId = createBridge.json.bridge.bridgeId;

  const bridgeList = await httpGet(`http://127.0.0.1:${ports.platform}/v1/bridge-registrations`);
  assert.equal(bridgeList.status, 200);
  assert.ok(bridgeList.json.bridges.length >= 1);
  assert.ok(bridgeList.json.bridges.some((bridge) => bridge.bridgeId === bridgeId));

  const bridgeDetail = await httpGet(`http://127.0.0.1:${ports.platform}/v1/bridge-registrations/${bridgeId}`);
  assert.equal(bridgeDetail.status, 200);
  assert.equal(bridgeDetail.json.bridge.bridgeId, bridgeId);

  bridgeMode = 'invalid-manifest';
  const createInvalidBridge = await httpPost(`http://127.0.0.1:${ports.platform}/v1/bridge-registrations`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b6',
    userId: 'owner-bridge',
    name: 'Invalid Stub Bridge',
    baseUrl: `http://127.0.0.1:${ports.bridge}`,
    serviceId: 'executor-bridge-sample',
  });
  assert.equal(createInvalidBridge.status, 502);
  assert.equal(createInvalidBridge.json.code, 'BRIDGE_METADATA_INVALID');

  bridgeMode = 'invalid-health';
  const activateInvalidBridge = await httpPost(`http://127.0.0.1:${ports.platform}/v1/bridge-registrations/${bridgeId}/activate`, {
    schemaVersion: 'v1',
    userId: 'owner-bridge',
  });
  assert.equal(activateInvalidBridge.status, 502);
  assert.equal(activateInvalidBridge.json.code, 'BRIDGE_METADATA_INVALID');

  bridgeMode = 'valid';
  const activateBridge = await httpPost(`http://127.0.0.1:${ports.platform}/v1/bridge-registrations/${bridgeId}/activate`, {
    schemaVersion: 'v1',
    userId: 'owner-bridge',
  });
  assert.equal(activateBridge.status, 200);
  assert.equal(activateBridge.json.bridge.status, 'active');
  assert.ok(bridgeRequests.some((request) => request.path === '/manifest'));
  assert.ok(bridgeRequests.some((request) => request.path === '/health'));

  const createMissingBridgeAgent = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b6',
    templateVersionRef: templateVersionId,
    name: 'Missing Bridge Agent',
    createdBy: 'owner-bridge',
    executorStrategy: 'external_runtime',
  });
  assert.equal(createMissingBridgeAgent.status, 400);
  assert.equal(createMissingBridgeAgent.json.code, 'BRIDGE_ID_REQUIRED');

  const createIllegalPlatformAgent = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b6',
    templateVersionRef: templateVersionId,
    name: 'Illegal Platform Agent',
    createdBy: 'owner-bridge',
    executorStrategy: 'platform_runtime',
    bridgeId,
  });
  assert.equal(createIllegalPlatformAgent.status, 409);
  assert.equal(createIllegalPlatformAgent.json.code, 'BRIDGE_ID_NOT_ALLOWED');

  const createWorkspaceMismatchAgent = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-other',
    templateVersionRef: templateVersionId,
    name: 'Workspace Mismatch Agent',
    createdBy: 'owner-bridge',
    executorStrategy: 'external_runtime',
    bridgeId,
  });
  assert.equal(createWorkspaceMismatchAgent.status, 409);
  assert.equal(createWorkspaceMismatchAgent.json.code, 'BRIDGE_WORKSPACE_MISMATCH');

  const createExternalAgent = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents`, {
    schemaVersion: 'v1',
    workspaceId: 'workspace-b6',
    templateVersionRef: templateVersionId,
    name: 'External Bridge Agent',
    createdBy: 'owner-bridge',
    ownerActorRef: 'owner-bridge',
    riskLevel: 'R1',
    executorStrategy: 'external_runtime',
    bridgeId,
  });
  assert.equal(createExternalAgent.status, 201);
  const agentId = createExternalAgent.json.agent.agentId;

  const activateAgent = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/activate`, {
    schemaVersion: 'v1',
    userId: 'owner-bridge',
    summary: 'Activate external runtime agent',
  });
  assert.equal(activateAgent.status, 202);

  const approveActivateAgent = await httpPost(
    `http://127.0.0.1:${ports.platform}/v1/governance-change-requests/${activateAgent.json.governanceRequest.requestId}/approve`,
    {
      schemaVersion: 'v1',
      actorRef: 'approver-bridge',
    },
  );
  assert.equal(approveActivateAgent.status, 200);
  assert.equal(approveActivateAgent.json.agent.activationState, 'active');

  const startAgentRun = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/runs`, {
    schemaVersion: 'v1',
    traceId: 'trace-agent-run',
    sessionId: 'session-agent-run',
    userId: 'owner-bridge',
    inputText: 'Run the bridge flow',
  });
  assert.equal(startAgentRun.status, 201);
  assert.equal(runtimeStartRequests.length, 1);
  assert.equal(runtimeStartRequests[0].agentId, agentId);
  assert.equal(runtimeStartRequests[0].externalRuntime.bridgeId, bridgeId);
  assert.equal(
    runtimeStartRequests[0].externalRuntime.callbackUrl,
    `http://127.0.0.1:${ports.runtime}/internal/runtime/bridge-callback`,
  );

  const cancelExternalRun = await httpPost(
    `http://127.0.0.1:${ports.platform}/v1/runs/${startAgentRun.json.run.run.runId}/cancel`,
    {
      schemaVersion: 'v1',
      traceId: 'trace-cancel-external',
      userId: 'owner-bridge',
      reason: 'manual_stop',
    },
  );
  assert.equal(cancelExternalRun.status, 200);
  assert.equal(runtimeCancelRequests.length, 1);
  assert.equal(runtimeCancelRequests[0].runId, startAgentRun.json.run.run.runId);

  const cancelUnsupported = await httpPost(`http://127.0.0.1:${ports.platform}/v1/runs/run-nonexternal/cancel`, {
    schemaVersion: 'v1',
    traceId: 'trace-cancel-plain',
    userId: 'owner-bridge',
  });
  assert.equal(cancelUnsupported.status, 409);
  assert.equal(cancelUnsupported.json.code, 'RUN_CANCEL_UNSUPPORTED');

  const suspendBridge = await httpPost(`http://127.0.0.1:${ports.platform}/v1/bridge-registrations/${bridgeId}/suspend`, {
    schemaVersion: 'v1',
    userId: 'owner-bridge',
  });
  assert.equal(suspendBridge.status, 200);
  assert.equal(suspendBridge.json.bridge.status, 'suspended');

  const startWhileSuspended = await httpPost(`http://127.0.0.1:${ports.platform}/v1/agents/${agentId}/runs`, {
    schemaVersion: 'v1',
    traceId: 'trace-agent-run-2',
    sessionId: 'session-agent-run-2',
    userId: 'owner-bridge',
  });
  assert.equal(startWhileSuspended.status, 409);
  assert.equal(startWhileSuspended.json.code, 'BRIDGE_NOT_ACTIVE');
});
