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

const connectorRegistryJson = JSON.stringify([
  {
    connectorKey: 'issue_tracker',
    packageName: '@baseinterface/connector-issue-tracker-sample',
    exportName: 'issueTrackerSampleConnector',
    enabled: true,
  },
  {
    connectorKey: 'ci_pipeline',
    packageName: '@baseinterface/connector-ci-pipeline-sample',
    exportName: 'ciPipelineSampleConnector',
    enabled: true,
  },
]);

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
    UNIASSIST_CONNECTOR_REGISTRY_JSON: connectorRegistryJson,
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

  const undeployedRun = await httpPost(
    `http://127.0.0.1:${ports.runtime}/internal/runtime/start-run`,
    buildStartRunBody({
      templateVersionId: 'undeployed',
      workflowKey: 'b7-sync-source-control',
      actionRef: 'change_review_upsert',
      connectorKey: 'source_control',
      capabilityId: 'change_review.upsert',
      executionMode: 'sync',
    }),
  );
  assert.equal(undeployedRun.status, 200);
  assert.equal(undeployedRun.json.run.run.status, 'failed');
  assert.equal(undeployedRun.json.run.nodeRuns[0].status, 'failed');
  assert.match(JSON.stringify(undeployedRun.json.run.nodeRuns[0].metadata.connectorError), /connector runtime responded 404/);

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
    UNIASSIST_CONNECTOR_REGISTRY_JSON: connectorRegistryJson,
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
      eventId: 'callback-seq-1-initial',
      receiptKey: 'ci-action:delivery-1',
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
  assert.equal(callback.json.receipt.sourceKind, 'action_callback');
  assert.equal(callback.json.receipt.eventType, 'result');
  assert.equal(callback.json.receipt.status, 'accepted');
  assert.equal(callback.json.receipt.receiptKey, 'ci-action:delivery-1');

  const duplicate = await httpPost(
    `http://127.0.0.1:${ports.connectorRuntime}/hooks/connectors/action-callbacks/${publicCallbackKey}`,
    {
      eventId: 'callback-seq-1-retry',
      receiptKey: 'ci-action:delivery-1',
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
  assert.equal(duplicate.json.receipt.sourceKind, 'action_callback');
  assert.equal(duplicate.json.receipt.status, 'accepted');
  assert.equal(duplicate.json.receipt.receiptKey, 'ci-action:delivery-1');

  const queriedRun = await httpGet(`http://127.0.0.1:${ports.runtime}/internal/runtime/runs/${asyncRun.json.run.run.runId}`);
  assert.equal(queriedRun.status, 200);
  assert.equal(queriedRun.json.run.run.status, 'completed');
  assert.ok(queriedRun.json.run.artifacts.some((artifact) => artifact.artifactType === 'ValidationReport'));
  assert.equal(queriedRun.json.run.run.metadata.connectorRuntime.actionSessions.length, 1);
  assert.equal(queriedRun.json.run.run.metadata.connectorRuntime.eventReceipts.length, 2);
  assert.deepEqual(
    queriedRun.json.run.run.metadata.connectorRuntime.eventReceipts.map((receipt) => receipt.status).sort(),
    ['accepted', 'rejected'],
  );
  assert.deepEqual(
    queriedRun.json.run.run.metadata.connectorRuntime.eventReceipts.map((receipt) => receipt.receiptKey).sort(),
    ['ci-action:callback-seq-2', 'ci-action:delivery-1'],
  );
  assert.ok(
    queriedRun.json.run.run.metadata.connectorRuntime.eventReceipts.every((receipt) => receipt.sourceKind === 'action_callback'),
  );
});
