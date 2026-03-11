import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ports = {
  provider: 19990,
  runtime: 19992,
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
  const signPayload = `${ts}.${nonce}.${method.toUpperCase()}.${path}.${bodyHash}`;
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

async function postInternal(url, path, body, subject = 'workflow-platform-api') {
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
      }),
    },
    body: rawBody,
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

test('workflow runtime supports executor resume and approval gate flows', async (t) => {
  const internalEnv = {
    UNIASSIST_INTERNAL_AUTH_MODE: internalAuth.mode,
    UNIASSIST_INTERNAL_AUTH_ISSUER: internalAuth.issuer,
    UNIASSIST_INTERNAL_AUTH_KEYS_JSON: JSON.stringify({ [internalAuth.kid]: internalAuth.secret }),
    UNIASSIST_INTERNAL_AUTH_SIGNING_KID: internalAuth.kid,
  };

  const provider = startService('provider-plan', ['--filter', '@baseinterface/provider-plan', 'start'], {
    PORT: String(ports.provider),
    UNIASSIST_SERVICE_ID: 'provider-plan',
    ...internalEnv,
  });
  const runtime = startService('workflow-runtime', ['--filter', '@baseinterface/workflow-runtime', 'start'], {
    PORT: String(ports.runtime),
    UNIASSIST_SERVICE_ID: 'workflow-runtime',
    UNIASSIST_PLAN_PROVIDER_BASE_URL: `http://127.0.0.1:${ports.provider}`,
    ...internalEnv,
  });

  const stopAll = () => {
    provider.kill('SIGTERM');
    runtime.kill('SIGTERM');
  };

  t.after(async () => {
    stopAll();
    await sleep(500);
  });

  await waitForHealth(`http://127.0.0.1:${ports.provider}/health`);
  await waitForHealth(`http://127.0.0.1:${ports.runtime}/health`);

  const runtimeBaseUrl = `http://127.0.0.1:${ports.runtime}`;

  const executorSpec = {
    schemaVersion: 'v1',
    workflowKey: 'plan-b1-executor',
    name: 'Plan Executor Flow',
    compatProviderId: 'plan',
    entryNode: 'collect',
    nodes: [
      {
        nodeKey: 'collect',
        nodeType: 'executor',
        executorId: 'compat-plan',
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

  const executorTemplate = buildTemplate('ver-executor', executorSpec);
  const startResponse = await postInternal(runtimeBaseUrl, '/internal/runtime/start-run', {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    sessionId: 's-runtime-executor',
    userId: 'u-runtime',
    ...executorTemplate,
    inputText: '请帮我制定本周计划',
  });

  assert.equal(startResponse.status, 200);
  assert.equal(startResponse.json.run.run.status, 'waiting_input');
  const firstQuestion = startResponse.json.events.find((event) => event.kind === 'waiting_input');
  assert.ok(firstQuestion);
  assert.equal(firstQuestion.payload.taskId, `task:${startResponse.json.run.run.runId}`);

  const goalResponse = await postInternal(runtimeBaseUrl, '/internal/runtime/resume-run', {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    sessionId: 's-runtime-executor',
    userId: 'u-runtime',
    runId: startResponse.json.run.run.runId,
    compatProviderId: 'plan',
    actionId: 'answer_task_question',
    replyToken: firstQuestion.payload.replyToken,
    taskId: firstQuestion.payload.taskId,
    payload: {
      text: '完成 B1 平台骨架',
    },
  });

  assert.equal(goalResponse.status, 200);
  assert.equal(goalResponse.json.run.run.status, 'waiting_input');
  const dueDateQuestion = goalResponse.json.events.find((event) => event.kind === 'waiting_input');
  assert.ok(dueDateQuestion);
  assert.match(dueDateQuestion.payload.questionId, /dueDate/i);

  const dueDateResponse = await postInternal(runtimeBaseUrl, '/internal/runtime/resume-run', {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    sessionId: 's-runtime-executor',
    userId: 'u-runtime',
    runId: startResponse.json.run.run.runId,
    compatProviderId: 'plan',
    actionId: 'answer_task_question',
    replyToken: dueDateQuestion.payload.replyToken,
    taskId: dueDateQuestion.payload.taskId,
    payload: {
      text: '2026-03-31',
      dueDate: '2026-03-31',
    },
  });

  assert.equal(dueDateResponse.status, 200);
  assert.equal(dueDateResponse.json.run.run.status, 'paused');
  assert.ok(dueDateResponse.json.events.some((event) => event.kind === 'node_state' && event.payload.compatTaskState === 'ready'));

  const executeResponse = await postInternal(runtimeBaseUrl, '/internal/runtime/resume-run', {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    sessionId: 's-runtime-executor',
    userId: 'u-runtime',
    runId: startResponse.json.run.run.runId,
    compatProviderId: 'plan',
    actionId: 'execute_task',
    taskId: dueDateQuestion.payload.taskId,
  });

  assert.equal(executeResponse.status, 200);
  assert.equal(executeResponse.json.run.run.status, 'completed');
  assert.ok(executeResponse.json.events.some((event) => event.kind === 'artifact_created'));

  const approvalSpec = {
    schemaVersion: 'v1',
    workflowKey: 'plan-b1-approval',
    name: 'Approval Flow',
    compatProviderId: 'plan',
    entryNode: 'approve',
    nodes: [
      {
        nodeKey: 'approve',
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
  };

  const approvalTemplate = buildTemplate('ver-approval', approvalSpec);
  const approvalStart = await postInternal(runtimeBaseUrl, '/internal/runtime/start-run', {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    sessionId: 's-runtime-approval',
    userId: 'u-runtime',
    ...approvalTemplate,
  });

  assert.equal(approvalStart.status, 200);
  assert.equal(approvalStart.json.run.run.status, 'waiting_approval');
  const approvalRequested = approvalStart.json.events.find((event) => event.kind === 'approval_requested');
  assert.ok(approvalRequested);

  const approvalResume = await postInternal(runtimeBaseUrl, '/internal/runtime/resume-run', {
    schemaVersion: 'v1',
    traceId: randomUUID(),
    sessionId: 's-runtime-approval',
    userId: 'u-runtime',
    runId: approvalStart.json.run.run.runId,
    compatProviderId: 'plan',
    actionId: `approve_request:${approvalRequested.payload.approvalRequestId}`,
  });

  assert.equal(approvalResume.status, 200);
  assert.equal(approvalResume.json.run.run.status, 'completed');
  assert.ok(approvalResume.json.events.some((event) => event.kind === 'approval_decided'));
});
