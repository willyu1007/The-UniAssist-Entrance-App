import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ports = {
  bridge: 19984,
  runtime: 19985,
};

const internalAuth = {
  mode: 'enforce',
  issuer: 'uniassist-internal',
  kid: 'kid-main',
  secret: 'internal-secret-main',
};

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signInternalHeaders({
  method,
  path,
  rawBody = '',
  subject,
  audience,
  scopes = [],
  timestampMs = Date.now(),
  nonce = randomUUID(),
  jti = randomUUID(),
}) {
  const ts = String(timestampMs);
  const claims = {
    iss: internalAuth.issuer,
    sub: subject,
    aud: audience,
    scope: scopes.join(' ').trim(),
    iat: Math.floor(timestampMs / 1000),
    exp: Math.floor(timestampMs / 1000) + 300,
    jti,
  };
  const header = {
    alg: 'HS256',
    typ: 'JWT',
    kid: internalAuth.kid,
  };
  const headerEncoded = base64urlJson(header);
  const payloadEncoded = base64urlJson(claims);
  const unsigned = `${headerEncoded}.${payloadEncoded}`;
  const tokenSig = createHmac('sha256', internalAuth.secret).update(unsigned).digest('base64url');
  const token = `${unsigned}.${tokenSig}`;
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  const signablePath = path.split('?')[0] || path;
  const signPayload = `${ts}.${nonce}.${method.toUpperCase()}.${signablePath}.${bodyHash}`;
  const requestSig = createHmac('sha256', internalAuth.secret).update(signPayload).digest('hex');
  return {
    authorization: `Bearer ${token}`,
    'x-uniassist-internal-kid': internalAuth.kid,
    'x-uniassist-internal-ts': ts,
    'x-uniassist-internal-nonce': nonce,
    'x-uniassist-internal-signature': requestSig,
  };
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

async function postInternal(url, path, body, options = {}) {
  const {
    subject = 'workflow-platform-api',
    scopes = [],
  } = options;
  const rawBody = JSON.stringify(body);
  const response = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...signInternalHeaders({
        method: 'POST',
        path,
        rawBody,
        subject,
        audience: 'workflow-runtime',
        scopes,
      }),
    },
    body: rawBody,
  });
  const json = await response.json();
  return { status: response.status, json };
}

async function getInternal(url, path, subject = 'workflow-platform-api') {
  const response = await fetch(`${url}${path}`, {
    method: 'GET',
    headers: {
      ...signInternalHeaders({
        method: 'GET',
        path,
        subject,
        audience: 'workflow-runtime',
      }),
    },
  });
  const json = await response.json();
  return { status: response.status, json };
}

function buildTemplate(versionId, spec) {
  return {
    template: {
      workflowId: `wf-${versionId}`,
      workflowKey: spec.workflowKey,
      name: spec.name,
      compatProviderId: spec.compatProviderId,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    version: {
      templateVersionId: versionId,
      workflowId: `wf-${versionId}`,
      workflowKey: spec.workflowKey,
      version: 1,
      status: 'published',
      spec,
      createdAt: Date.now(),
    },
  };
}

async function waitForRunSnapshot(runtimeBaseUrl, runId, predicate, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await getInternal(runtimeBaseUrl, `/internal/runtime/runs/${runId}`);
    if (response.status === 200 && predicate(response.json.run)) {
      return response.json;
    }
    await sleep(200);
  }
  throw new Error(`run ${runId} did not satisfy predicate`);
}

async function waitForRunStatus(runtimeBaseUrl, runId, expectedStatus, timeoutMs = 20_000) {
  return await waitForRunSnapshot(
    runtimeBaseUrl,
    runId,
    (snapshot) => snapshot.run.status === expectedStatus,
    timeoutMs,
  );
}

function buildExternalRuntimeSnapshot(runtimeBaseUrl) {
  return {
    bridgeId: 'bridge-sample',
    workspaceId: 'workspace-b6',
    name: 'Sample Bridge',
    baseUrl: `http://127.0.0.1:${ports.bridge}`,
    serviceId: 'executor-bridge-sample',
    runtimeType: 'external_agent_runtime',
    manifest: {
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
          supportsResume: true,
          supportsCancel: true,
          supportsApproval: true,
        },
      ],
    },
    authConfigJson: {},
    callbackConfigJson: {},
    callbackUrl: `${runtimeBaseUrl}/internal/runtime/bridge-callback`,
  };
}

test('workflow runtime handles B6 external runtime bridge flow end-to-end', async (t) => {
  const internalEnv = {
    UNIASSIST_INTERNAL_AUTH_MODE: internalAuth.mode,
    UNIASSIST_INTERNAL_AUTH_ISSUER: internalAuth.issuer,
    UNIASSIST_INTERNAL_AUTH_KEYS_JSON: JSON.stringify({ [internalAuth.kid]: internalAuth.secret }),
    UNIASSIST_INTERNAL_AUTH_SIGNING_KID: internalAuth.kid,
  };

  const bridge = startService('executor-bridge-sample', ['--filter', '@baseinterface/executor-bridge-sample', 'start'], {
    PORT: String(ports.bridge),
    UNIASSIST_SERVICE_ID: 'executor-bridge-sample',
    UNIASSIST_WORKFLOW_RUNTIME_SERVICE_ID: 'workflow-runtime',
    ...internalEnv,
  });
  const runtime = startService('workflow-runtime-b6', ['--filter', '@baseinterface/workflow-runtime', 'start'], {
    PORT: String(ports.runtime),
    UNIASSIST_SERVICE_ID: 'workflow-runtime',
    UNIASSIST_EXTERNAL_BRIDGE_ALLOWED_SUBJECTS: 'executor-bridge-sample',
    ...internalEnv,
  });

  t.after(async () => {
    bridge.kill('SIGTERM');
    runtime.kill('SIGTERM');
    await sleep(500);
  });

  await waitForHealth(`http://127.0.0.1:${ports.bridge}/health`);
  await waitForHealth(`http://127.0.0.1:${ports.runtime}/health`);

  const runtimeBaseUrl = `http://127.0.0.1:${ports.runtime}`;
  const externalRuntime = buildExternalRuntimeSnapshot(runtimeBaseUrl);
  const bridgeSpec = {
    schemaVersion: 'v1',
    workflowKey: 'sample-b6-external-bridge',
    name: 'External Bridge Sample',
    compatProviderId: 'sample',
    entryNode: 'external_assessment',
    nodes: [
      {
        nodeKey: 'external_assessment',
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
  const template = buildTemplate('ver-bridge', bridgeSpec);

  const startResponse = await postInternal(runtimeBaseUrl, '/internal/runtime/start-run', {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    sessionId: 'session-bridge',
    userId: 'teacher:bridge',
    agentId: 'agent-bridge',
    ...template,
    inputPayload: {
      subject: {
        subjectRef: 'student:bridge-case',
        subjectType: 'student',
      },
    },
    externalRuntime,
  });
  assert.equal(startResponse.status, 200);
  assert.equal(startResponse.json.run.run.status, 'running');

  const waitingApproval = await waitForRunStatus(runtimeBaseUrl, startResponse.json.run.run.runId, 'waiting_approval');
  assert.equal(waitingApproval.run.approvals.length, 1);
  assert.equal(waitingApproval.run.approvals[0].status, 'pending');
  const currentNode = waitingApproval.run.nodeRuns.find((node) => node.nodeRunId === waitingApproval.run.run.currentNodeRunId);
  assert.ok(currentNode?.metadata?.externalSessionRef);

  const missingScopeCallback = await postInternal(
    runtimeBaseUrl,
    '/internal/runtime/bridge-callback',
    {
      schemaVersion: 'v1',
      traceId: randomUUID(),
      callbackId: 'callback-missing-scope',
      sequence: 1,
      bridgeId: externalRuntime.bridgeId,
      runId: waitingApproval.run.run.runId,
      nodeRunId: currentNode.nodeRunId,
      externalSessionRef: currentNode.metadata.externalSessionRef,
      kind: 'checkpoint',
      emittedAt: Date.now(),
      payload: {
        stage: 'unauthorized',
      },
    },
    {
      subject: 'executor-bridge-sample',
    },
  );
  assert.equal(missingScopeCallback.status, 403);
  assert.equal(missingScopeCallback.json.code, 'AUTH_SCOPE_MISSING');

  const staleCallback = await postInternal(
    runtimeBaseUrl,
    '/internal/runtime/bridge-callback',
    {
      schemaVersion: 'v1',
      traceId: randomUUID(),
      callbackId: 'callback-stale-1',
      sequence: 2,
      bridgeId: externalRuntime.bridgeId,
      runId: waitingApproval.run.run.runId,
      nodeRunId: currentNode.nodeRunId,
      externalSessionRef: currentNode.metadata.externalSessionRef,
      kind: 'checkpoint',
      emittedAt: Date.now(),
      payload: {
        stage: 'stale',
      },
    },
    {
      subject: 'executor-bridge-sample',
      scopes: ['bridge:callback'],
    },
  );
  assert.equal(staleCallback.status, 409);
  assert.equal(staleCallback.json.code, 'BRIDGE_CALLBACK_OUT_OF_ORDER');

  const duplicateRejected = await postInternal(
    runtimeBaseUrl,
    '/internal/runtime/bridge-callback',
    {
      schemaVersion: 'v1',
      traceId: randomUUID(),
      callbackId: 'callback-stale-1',
      sequence: 2,
      bridgeId: externalRuntime.bridgeId,
      runId: waitingApproval.run.run.runId,
      nodeRunId: currentNode.nodeRunId,
      externalSessionRef: currentNode.metadata.externalSessionRef,
      kind: 'checkpoint',
      emittedAt: Date.now(),
      payload: {
        stage: 'duplicate',
      },
    },
    {
      subject: 'executor-bridge-sample',
      scopes: ['bridge:callback'],
    },
  );
  assert.equal(duplicateRejected.status, 200);
  assert.equal(duplicateRejected.json.accepted, true);
  assert.equal(duplicateRejected.json.duplicate, true);
  assert.equal(duplicateRejected.json.receipt.status, 'rejected');

  const approvalQueue = await getInternal(runtimeBaseUrl, '/internal/runtime/approvals/queue');
  assert.equal(approvalQueue.status, 200);
  assert.equal(approvalQueue.json.approvals.length, 1);

  const resumeResponse = await postInternal(
    runtimeBaseUrl,
    `/internal/runtime/approvals/${waitingApproval.run.approvals[0].approvalRequestId}/decision`,
    {
      schemaVersion: 'v1',
      traceId: randomUUID(),
      userId: 'teacher:bridge',
      decision: 'approved',
    },
  );
  assert.equal(resumeResponse.status, 200);
  assert.equal(resumeResponse.json.run.run.status, 'running');
  assert.ok(resumeResponse.json.events.some((event) => event.kind === 'approval.decided'));

  const completedRun = await waitForRunStatus(runtimeBaseUrl, waitingApproval.run.run.runId, 'completed');
  assert.equal(completedRun.run.approvalDecisions.length, 1);
  assert.ok(completedRun.run.artifacts.some((artifact) => artifact.artifactType === 'AssessmentDraft'));
  assert.ok(completedRun.run.artifacts.some((artifact) => artifact.artifactType === 'EvidencePack'));
  assert.equal(completedRun.run.deliveryTargets.length, 1);

  const nativeApprovalTemplate = buildTemplate('ver-bridge-native-approval', {
    schemaVersion: 'v1',
    workflowKey: 'sample-b6-native-approval-cancel',
    name: 'External Bridge With Native Approval',
    compatProviderId: 'sample',
    entryNode: 'external_assessment',
    nodes: [
      {
        nodeKey: 'external_assessment',
        nodeType: 'executor',
        executorId: 'compat-sample',
        transitions: {
          success: 'manager_review',
        },
      },
      {
        nodeKey: 'manager_review',
        nodeType: 'approval_gate',
        transitions: {
          approved: 'finish',
        },
      },
      {
        nodeKey: 'finish',
        nodeType: 'end',
      },
    ],
  });

  const nativeApprovalStart = await postInternal(runtimeBaseUrl, '/internal/runtime/start-run', {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    sessionId: 'session-bridge-native-approval',
    userId: 'teacher:bridge',
    agentId: 'agent-bridge',
    ...nativeApprovalTemplate,
    externalRuntime,
  });
  assert.equal(nativeApprovalStart.status, 200);

  const bridgeApproval = await waitForRunSnapshot(
    runtimeBaseUrl,
    nativeApprovalStart.json.run.run.runId,
    (snapshot) => snapshot.run.status === 'waiting_approval' && snapshot.approvals.length === 1,
  );
  const bridgeApprovalRequest = bridgeApproval.run.approvals[0];

  const resumeToNativeApproval = await postInternal(
    runtimeBaseUrl,
    `/internal/runtime/approvals/${bridgeApprovalRequest.approvalRequestId}/decision`,
    {
      schemaVersion: 'v1',
      traceId: randomUUID(),
      userId: 'teacher:bridge',
      decision: 'approved',
    },
  );
  assert.equal(resumeToNativeApproval.status, 200);

  const nativeApprovalWaiting = await waitForRunSnapshot(
    runtimeBaseUrl,
    bridgeApproval.run.run.runId,
    (snapshot) => (
      snapshot.run.status === 'waiting_approval'
      && snapshot.approvals.length === 2
      && snapshot.nodeRuns.find((node) => node.nodeRunId === snapshot.run.currentNodeRunId)?.nodeKey === 'manager_review'
    ),
  );
  const nativeApprovalNode = nativeApprovalWaiting.run.nodeRuns.find(
    (node) => node.nodeRunId === nativeApprovalWaiting.run.run.currentNodeRunId,
  );
  assert.equal(nativeApprovalNode?.nodeType, 'approval_gate');
  assert.equal(nativeApprovalWaiting.run.approvals.filter((item) => item.status === 'pending').length, 1);

  const cancelNativeApproval = await postInternal(runtimeBaseUrl, '/internal/runtime/cancel-run', {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    userId: 'teacher:bridge',
    runId: nativeApprovalWaiting.run.run.runId,
    reason: 'manager_review_cancelled',
  });
  assert.equal(cancelNativeApproval.status, 200);
  assert.equal(cancelNativeApproval.json.run.run.status, 'cancelled');

  const cancelledAtNativeApproval = await waitForRunStatus(runtimeBaseUrl, nativeApprovalWaiting.run.run.runId, 'cancelled');
  const cancelledApprovalNode = cancelledAtNativeApproval.run.nodeRuns.find(
    (node) => node.nodeRunId === cancelledAtNativeApproval.run.run.currentNodeRunId,
  );
  assert.equal(cancelledApprovalNode?.nodeType, 'approval_gate');
  assert.equal(cancelledApprovalNode?.status, 'cancelled');
  assert.equal(
    cancelledAtNativeApproval.run.approvals.filter((item) => item.approvalRequestId !== bridgeApprovalRequest.approvalRequestId)[0]?.status,
    'cancelled',
  );

  const cancelStart = await postInternal(runtimeBaseUrl, '/internal/runtime/start-run', {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    sessionId: 'session-bridge-cancel',
    userId: 'teacher:bridge',
    agentId: 'agent-bridge',
    ...template,
    externalRuntime,
  });
  assert.equal(cancelStart.status, 200);

  const cancelResponse = await postInternal(runtimeBaseUrl, '/internal/runtime/cancel-run', {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    userId: 'teacher:bridge',
    runId: cancelStart.json.run.run.runId,
    reason: 'user_requested',
  });
  assert.equal(cancelResponse.status, 200);
  assert.equal(cancelResponse.json.run.run.status, 'cancelled');

  const cancelledRun = await waitForRunStatus(runtimeBaseUrl, cancelStart.json.run.run.runId, 'cancelled');
  assert.equal(cancelledRun.run.run.status, 'cancelled');
});
