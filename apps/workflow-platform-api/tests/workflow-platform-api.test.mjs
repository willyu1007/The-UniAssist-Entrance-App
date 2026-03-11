import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ports = {
  runtime: 9992,
  platform: 9991,
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

async function httpGet(url) {
  const response = await fetch(url);
  const json = await response.json();
  return { status: response.status, json };
}

test('workflow platform api manages templates and proxies runtime commands', async (t) => {
  const runtimeRequests = [];
  const runtimeServer = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const body = rawBody ? JSON.parse(rawBody) : {};
    runtimeRequests.push({ method: req.method, path: req.url, body });

    if (req.url === '/internal/runtime/start-run' && req.method === 'POST') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        schemaVersion: 'v1',
        run: {
          run: {
            runId: 'run-platform-start',
            workflowId: body.template.workflowId,
            workflowKey: body.template.workflowKey,
            templateVersionId: body.version.templateVersionId,
            compatProviderId: body.template.compatProviderId,
            status: 'waiting_input',
            sessionId: body.sessionId,
            userId: body.userId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          nodeRuns: [],
          approvals: [],
          artifacts: [],
        },
        events: [],
      }));
      return;
    }

    if (req.url === '/internal/runtime/resume-run' && req.method === 'POST') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        schemaVersion: 'v1',
        run: {
          run: {
            runId: body.runId,
            workflowId: 'wf-platform',
            workflowKey: 'plan-b1-platform',
            templateVersionId: 'ver-platform',
            compatProviderId: 'plan',
            status: 'completed',
            sessionId: body.sessionId,
            userId: body.userId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            completedAt: Date.now(),
          },
          nodeRuns: [],
          approvals: [],
          artifacts: [],
        },
        events: [],
      }));
      return;
    }

    if (req.url === '/internal/runtime/approvals' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        schemaVersion: 'v1',
        approvals: [
          {
            approvalRequestId: 'approval-1',
            runId: 'run-platform-start',
            status: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      }));
      return;
    }

    if (req.url === '/internal/runtime/artifacts/artifact-1' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        schemaVersion: 'v1',
        artifact: {
          artifactId: 'artifact-1',
          runId: 'run-platform-start',
          artifactType: 'executor_result',
          state: 'validated',
          payloadJson: { done: true },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      }));
      return;
    }

    if (req.url === '/internal/runtime/runs/run-platform-start' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        schemaVersion: 'v1',
        run: {
          run: {
            runId: 'run-platform-start',
            workflowId: 'wf-platform',
            workflowKey: 'plan-b1-platform',
            templateVersionId: 'ver-platform',
            compatProviderId: 'plan',
            status: 'waiting_input',
            sessionId: 's-platform',
            userId: 'u-platform',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          nodeRuns: [],
          approvals: [],
          artifacts: [],
        },
      }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolvePromise) => runtimeServer.listen(ports.runtime, '127.0.0.1', resolvePromise));
  t.after(async () => {
    await new Promise((resolvePromise) => runtimeServer.close(resolvePromise));
  });

  const platform = startService('workflow-platform-api', ['--filter', '@baseinterface/workflow-platform-api', 'start'], {
    PORT: String(ports.platform),
    UNIASSIST_SERVICE_ID: 'workflow-platform-api',
    UNIASSIST_WORKFLOW_RUNTIME_BASE_URL: `http://127.0.0.1:${ports.runtime}`,
  });
  t.after(async () => {
    platform.kill('SIGTERM');
    await sleep(500);
  });

  await waitForHealth(`http://127.0.0.1:${ports.platform}/health`);

  const workflowSpec = {
    schemaVersion: 'v1',
    workflowKey: 'plan-b1-platform',
    name: 'Plan Platform Flow',
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

  const created = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflows`, {
    schemaVersion: 'v1',
    workflowKey: workflowSpec.workflowKey,
    name: workflowSpec.name,
    compatProviderId: workflowSpec.compatProviderId,
    spec: workflowSpec,
  });

  assert.equal(created.status, 201);
  assert.equal(created.json.workflow.workflowKey, workflowSpec.workflowKey);
  assert.equal(created.json.version.status, 'published');

  const listed = await httpGet(`http://127.0.0.1:${ports.platform}/v1/workflows`);
  assert.equal(listed.status, 200);
  assert.equal(listed.json.workflows.length, 1);

  const fetched = await httpGet(`http://127.0.0.1:${ports.platform}/v1/workflows/${created.json.workflow.workflowId}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.json.workflow.workflow.workflowKey, workflowSpec.workflowKey);

  const started = await httpPost(`http://127.0.0.1:${ports.platform}/v1/runs`, {
    schemaVersion: 'v1',
    traceId: 'trace-platform-start',
    sessionId: 's-platform',
    userId: 'u-platform',
    workflowKey: workflowSpec.workflowKey,
    inputText: '帮我启动一个 workflow run',
  });

  assert.equal(started.status, 201);
  assert.equal(started.json.run.run.runId, 'run-platform-start');
  assert.equal(runtimeRequests.at(-1).path, '/internal/runtime/start-run');
  assert.equal(runtimeRequests.at(-1).body.template.workflowKey, workflowSpec.workflowKey);

  const runSnapshot = await httpGet(`http://127.0.0.1:${ports.platform}/v1/runs/run-platform-start`);
  assert.equal(runSnapshot.status, 200);
  assert.equal(runSnapshot.json.run.run.runId, 'run-platform-start');

  const resumed = await httpPost(`http://127.0.0.1:${ports.platform}/v1/runs/run-platform-start/resume`, {
    schemaVersion: 'v1',
    traceId: 'trace-platform-resume',
    sessionId: 's-platform',
    userId: 'u-platform',
    actionId: 'execute_task',
  });

  assert.equal(resumed.status, 200);
  assert.equal(resumed.json.run.run.status, 'completed');
  assert.equal(runtimeRequests.at(-1).path, '/internal/runtime/resume-run');
  assert.equal(runtimeRequests.at(-1).body.runId, 'run-platform-start');

  const approvals = await httpGet(`http://127.0.0.1:${ports.platform}/v1/approvals`);
  assert.equal(approvals.status, 200);
  assert.equal(approvals.json.approvals.length, 1);

  const artifact = await httpGet(`http://127.0.0.1:${ports.platform}/v1/artifacts/artifact-1`);
  assert.equal(artifact.status, 200);
  assert.equal(artifact.json.artifact.artifactId, 'artifact-1');
});
