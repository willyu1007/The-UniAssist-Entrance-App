import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ports = {
  runtime: 19994,
  connectorRuntime: 19995,
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

async function stopService(child) {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }
  await new Promise((resolvePromise) => {
    child.once('exit', resolvePromise);
    child.kill('SIGTERM');
  });
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

function buildTemplate(templateVersionId, spec) {
  const timestamp = Date.now();
  return {
    template: {
      workflowId: `wf-${templateVersionId}`,
      workflowKey: spec.workflowKey,
      name: spec.name,
      compatProviderId: spec.compatProviderId,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    version: {
      templateVersionId,
      workflowId: `wf-${templateVersionId}`,
      workflowKey: spec.workflowKey,
      version: 1,
      status: 'published',
      spec,
      createdAt: timestamp,
    },
  };
}

function buildStartRunBody({
  templateVersionId,
  workflowKey,
  actionRef,
  connectorKey,
  capabilityId,
  executionMode,
}) {
  const spec = {
    schemaVersion: 'v1',
    workflowKey,
    name: workflowKey,
    compatProviderId: 'sample',
    entryNode: 'connector_step',
    nodes: [
      {
        nodeKey: 'connector_step',
        nodeType: 'executor',
        executorId: 'connector-runtime',
        config: {
          actionRef,
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

  return {
    schemaVersion: 'v1',
    traceId: `trace-${templateVersionId}`,
    sessionId: `session-${templateVersionId}`,
    userId: 'runtime-user',
    agentId: `agent-${templateVersionId}`,
    sourceType: 'manual',
    runtimeMetadata: {
      workspaceId: 'workspace-runtime',
    },
    connectorActions: {
      [actionRef]: {
        actionRef,
        actionBindingId: `action-binding-${templateVersionId}`,
        connectorBindingId: `connector-binding-${templateVersionId}`,
        connectorKey,
        capabilityId,
        sideEffectClass: 'write',
        executionMode,
        browserFallbackMode: 'disabled',
        configJson: {
          sample: true,
        },
      },
    },
    ...buildTemplate(templateVersionId, spec),
  };
}

test('workflow runtime executes B7 connector sync and async actions with callback dedupe', async (t) => {
  let connectorRuntime = startService('connector-runtime-b7', ['--filter', '@baseinterface/connector-runtime', 'start'], {
    PORT: String(ports.connectorRuntime),
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
    UNIASSIST_WORKFLOW_RUNTIME_BASE_URL: `http://127.0.0.1:${ports.runtime}`,
  });
  const runtime = startService('workflow-runtime-b7', ['--filter', '@baseinterface/workflow-runtime', 'start'], {
    PORT: String(ports.runtime),
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
    UNIASSIST_CONNECTOR_RUNTIME_BASE_URL: `http://127.0.0.1:${ports.connectorRuntime}`,
  });

  t.after(async () => {
    await stopService(connectorRuntime);
    await stopService(runtime);
  });

  await waitForHealth(`http://127.0.0.1:${ports.runtime}/health`);
  await waitForHealth(`http://127.0.0.1:${ports.connectorRuntime}/health`);

  const syncRun = await httpPost(
    `http://127.0.0.1:${ports.runtime}/internal/runtime/start-run`,
    buildStartRunBody({
      templateVersionId: 'sync',
      workflowKey: 'b7-sync-issue',
      actionRef: 'issue_create',
      connectorKey: 'issue_tracker',
      capabilityId: 'issue.upsert',
      executionMode: 'sync',
    }),
  );
  assert.equal(syncRun.status, 200);
  assert.equal(syncRun.json.run.run.status, 'completed');
  assert.ok(syncRun.json.run.artifacts.some((artifact) => artifact.artifactType === 'ActionReceipt'));

  const asyncRun = await httpPost(
    `http://127.0.0.1:${ports.runtime}/internal/runtime/start-run`,
    buildStartRunBody({
      templateVersionId: 'async',
      workflowKey: 'b7-async-pipeline',
      actionRef: 'pipeline_start',
      connectorKey: 'ci_pipeline',
      capabilityId: 'pipeline.start',
      executionMode: 'async',
    }),
  );
  assert.equal(asyncRun.status, 200);
  assert.equal(asyncRun.json.run.run.status, 'running');
  const nodeRun = asyncRun.json.run.nodeRuns[0];
  const publicCallbackKey = nodeRun.metadata.publicCallbackKey;
  const externalSessionRef = nodeRun.metadata.externalSessionRef;
  assert.equal(typeof publicCallbackKey, 'string');
  assert.equal(typeof externalSessionRef, 'string');

  await stopService(connectorRuntime);
  await sleep(500);
  connectorRuntime = startService('connector-runtime-b7-restarted', ['--filter', '@baseinterface/connector-runtime', 'start'], {
    PORT: String(ports.connectorRuntime),
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
    UNIASSIST_WORKFLOW_RUNTIME_BASE_URL: `http://127.0.0.1:${ports.runtime}`,
  });
  await waitForHealth(`http://127.0.0.1:${ports.connectorRuntime}/health`);

  const outOfOrder = await httpPost(
    `http://127.0.0.1:${ports.connectorRuntime}/hooks/connectors/action-callbacks/${publicCallbackKey}`,
    {
      eventId: 'callback-seq-2',
      sequence: 2,
      emittedAt: Date.now(),
      status: 'passed',
      pipelineRef: 'pipeline:async',
      externalSessionRef,
      summary: 'out of order callback',
    },
  );
  assert.equal(outOfOrder.status, 409);
  assert.equal(outOfOrder.json.code, 'CONNECTOR_CALLBACK_OUT_OF_ORDER');

  const callback = await httpPost(
    `http://127.0.0.1:${ports.connectorRuntime}/hooks/connectors/action-callbacks/${publicCallbackKey}`,
    {
      eventId: 'callback-seq-1',
      sequence: 1,
      emittedAt: Date.now(),
      status: 'passed',
      pipelineRef: 'pipeline:async',
      externalSessionRef,
      summary: 'pipeline completed',
      details: {
        commit: 'abc123',
      },
    },
  );
  assert.equal(callback.status, 202);
  assert.equal(callback.json.accepted, true);

  const duplicate = await httpPost(
    `http://127.0.0.1:${ports.connectorRuntime}/hooks/connectors/action-callbacks/${publicCallbackKey}`,
    {
      eventId: 'callback-seq-1',
      sequence: 1,
      emittedAt: Date.now(),
      status: 'passed',
      pipelineRef: 'pipeline:async',
      externalSessionRef,
      summary: 'pipeline completed',
      details: {
        commit: 'abc123',
      },
    },
  );
  assert.equal(duplicate.status, 202);
  assert.equal(duplicate.json.duplicate, true);

  const queriedRun = await httpGet(`http://127.0.0.1:${ports.runtime}/internal/runtime/runs/${asyncRun.json.run.run.runId}`);
  assert.equal(queriedRun.status, 200);
  assert.equal(queriedRun.json.run.run.status, 'completed');
  assert.ok(queriedRun.json.run.artifacts.some((artifact) => artifact.artifactType === 'ValidationReport'));
});
