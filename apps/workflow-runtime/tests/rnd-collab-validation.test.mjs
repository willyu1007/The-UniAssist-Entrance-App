import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ports = {
  runtime: 19996,
  connectorRuntime: 19997,
  providerSample: 19998,
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

function loadJson(relativePath) {
  return JSON.parse(readFileSync(resolve(rootDir, relativePath), 'utf8'));
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

function buildPrimarySpec() {
  return {
    schemaVersion: 'v1',
    workflowKey: 'sample-b8-rnd-collab',
    name: 'R&D Collaboration Validation Sample',
    compatProviderId: 'sample',
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
    metadata: {
      scenario: 'rnd_collab_validation',
    },
  };
}

function buildPrimaryStartRunBody(templateVersionId) {
  const spec = buildPrimarySpec();
  return {
    schemaVersion: 'v1',
    traceId: `trace-${templateVersionId}`,
    sessionId: `session-${templateVersionId}`,
    userId: 'runtime-user',
    sourceType: 'manual',
    runtimeMetadata: {
      workspaceId: 'workspace-rnd-collab',
    },
    inputPayload: loadJson('docs/scenarios/rnd-collab/canonical-input.json'),
    connectorActions: {
      issue_upsert: {
        actionRef: 'issue_upsert',
        actionBindingId: `action-binding-issue-${templateVersionId}`,
        connectorBindingId: `connector-binding-issue-${templateVersionId}`,
        connectorKey: 'issue_tracker',
        capabilityId: 'issue.upsert',
        sideEffectClass: 'write',
        executionMode: 'sync',
        browserFallbackMode: 'disabled',
        configJson: {
          scenario: 'rnd-collab',
        },
      },
      change_review_upsert: {
        actionRef: 'change_review_upsert',
        actionBindingId: `action-binding-source-control-${templateVersionId}`,
        connectorBindingId: `connector-binding-source-control-${templateVersionId}`,
        connectorKey: 'source_control',
        capabilityId: 'change_review.upsert',
        sideEffectClass: 'write',
        executionMode: 'sync',
        browserFallbackMode: 'disabled',
        configJson: {
          scenario: 'rnd-collab',
        },
      },
      pipeline_start: {
        actionRef: 'pipeline_start',
        actionBindingId: `action-binding-pipeline-${templateVersionId}`,
        connectorBindingId: `connector-binding-pipeline-${templateVersionId}`,
        connectorKey: 'ci_pipeline',
        capabilityId: 'pipeline.start',
        sideEffectClass: 'write',
        executionMode: 'async',
        browserFallbackMode: 'disabled',
        configJson: {
          scenario: 'rnd-collab',
        },
      },
    },
    ...buildTemplate(templateVersionId, spec),
  };
}

test('workflow runtime executes the B8 primary R&D collaboration flow with approval, sync writes, and CI callback', async (t) => {
  const providerSample = startService('provider-sample-b8', ['--filter', '@baseinterface/provider-sample', 'start'], {
    PORT: String(ports.providerSample),
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
  });
  let connectorRuntime = startService('connector-runtime-b8', ['--filter', '@baseinterface/connector-runtime', 'start'], {
    PORT: String(ports.connectorRuntime),
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
    UNIASSIST_WORKFLOW_RUNTIME_BASE_URL: `http://127.0.0.1:${ports.runtime}`,
  });
  const runtime = startService('workflow-runtime-b8', ['--filter', '@baseinterface/workflow-runtime', 'start'], {
    PORT: String(ports.runtime),
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
    UNIASSIST_CONNECTOR_RUNTIME_BASE_URL: `http://127.0.0.1:${ports.connectorRuntime}`,
    UNIASSIST_SAMPLE_PROVIDER_BASE_URL: `http://127.0.0.1:${ports.providerSample}`,
  });

  t.after(async () => {
    await stopService(providerSample);
    await stopService(connectorRuntime);
    await stopService(runtime);
  });

  await waitForHealth(`http://127.0.0.1:${ports.runtime}/health`);
  await waitForHealth(`http://127.0.0.1:${ports.connectorRuntime}/health`);
  await waitForHealth(`http://127.0.0.1:${ports.providerSample}/health`);

  const started = await httpPost(
    `http://127.0.0.1:${ports.runtime}/internal/runtime/start-run`,
    buildPrimaryStartRunBody('rnd-collab-primary'),
  );
  assert.equal(started.status, 200);
  assert.equal(started.json.run.run.status, 'waiting_approval');
  assert.deepEqual(
    started.json.run.approvals[0].payloadJson.artifactTypes,
    ['ChangeIntent', 'ExecutionPlan'],
  );
  assert.ok(started.json.run.artifacts.some((artifact) => artifact.artifactType === 'ChangeIntent'));
  assert.ok(started.json.run.artifacts.some((artifact) => artifact.artifactType === 'ExecutionPlan'));

  const approvalId = started.json.run.approvals[0].approvalRequestId;
  const approved = await httpPost(
    `http://127.0.0.1:${ports.runtime}/internal/runtime/approvals/${approvalId}/decision`,
    {
      schemaVersion: 'v1',
      traceId: 'trace-rnd-collab-approve',
      userId: 'reviewer:risk',
      decision: 'approved',
      comment: 'risk review approved',
    },
  );
  assert.equal(approved.status, 200);
  assert.equal(approved.json.approval.status, 'approved');
  assert.equal(approved.json.run.run.status, 'running');

  const pipelineNode = approved.json.run.nodeRuns.find((nodeRun) => nodeRun.nodeKey === 'pipeline_start');
  assert.equal(typeof pipelineNode?.metadata?.publicCallbackKey, 'string');
  assert.equal(pipelineNode?.metadata?.externalSessionRef, 'pipeline:case-1');
  assert.equal(
    approved.json.run.artifacts.filter((artifact) => artifact.artifactType === 'ActionReceipt').length,
    2,
  );
  const issueReceipt = approved.json.run.artifacts.find((artifact) => (
    artifact.artifactType === 'ActionReceipt' && artifact.payloadJson?.connectorKey === 'issue_tracker'
  ));
  const changeReviewReceipt = approved.json.run.artifacts.find((artifact) => (
    artifact.artifactType === 'ActionReceipt' && artifact.payloadJson?.connectorKey === 'source_control'
  ));
  assert.equal(issueReceipt?.payloadJson?.externalRef, 'UA-101');
  assert.equal(issueReceipt?.payloadJson?.result?.issueKey, 'UA-101');
  assert.equal(changeReviewReceipt?.payloadJson?.externalRef, 'CR-101');
  assert.equal(changeReviewReceipt?.payloadJson?.result?.changeReviewRef, 'CR-101');

  await stopService(connectorRuntime);
  await sleep(500);
  connectorRuntime = startService('connector-runtime-b8-restarted', ['--filter', '@baseinterface/connector-runtime', 'start'], {
    PORT: String(ports.connectorRuntime),
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
    UNIASSIST_WORKFLOW_RUNTIME_BASE_URL: `http://127.0.0.1:${ports.runtime}`,
  });
  await waitForHealth(`http://127.0.0.1:${ports.connectorRuntime}/health`);

  const outOfOrder = await httpPost(
    `http://127.0.0.1:${ports.connectorRuntime}/hooks/connectors/action-callbacks/${pipelineNode.metadata.publicCallbackKey}`,
    {
      eventId: 'rnd-collab-callback-2',
      sequence: 2,
      emittedAt: Date.now(),
      status: 'passed',
      pipelineRef: 'pipeline:case-1',
      externalSessionRef: pipelineNode.metadata.externalSessionRef,
      summary: 'callback out of order',
    },
  );
  assert.equal(outOfOrder.status, 409);
  assert.equal(outOfOrder.json.code, 'CONNECTOR_CALLBACK_OUT_OF_ORDER');

  const callback = await httpPost(
    `http://127.0.0.1:${ports.connectorRuntime}/hooks/connectors/action-callbacks/${pipelineNode.metadata.publicCallbackKey}`,
    {
      eventId: 'rnd-collab-callback-1',
      sequence: 1,
      emittedAt: Date.now(),
      status: 'passed',
      pipelineRef: 'pipeline:case-1',
      externalSessionRef: pipelineNode.metadata.externalSessionRef,
      summary: 'pipeline completed',
      details: {
        commit: 'abc123',
      },
    },
  );
  assert.equal(callback.status, 202);
  assert.equal(callback.json.accepted, true);

  const duplicate = await httpPost(
    `http://127.0.0.1:${ports.connectorRuntime}/hooks/connectors/action-callbacks/${pipelineNode.metadata.publicCallbackKey}`,
    {
      eventId: 'rnd-collab-callback-1',
      sequence: 1,
      emittedAt: Date.now(),
      status: 'passed',
      pipelineRef: 'pipeline:case-1',
      externalSessionRef: pipelineNode.metadata.externalSessionRef,
      summary: 'pipeline completed',
      details: {
        commit: 'abc123',
      },
    },
  );
  assert.equal(duplicate.status, 202);
  assert.equal(duplicate.json.duplicate, true);

  const queriedRun = await httpGet(`http://127.0.0.1:${ports.runtime}/internal/runtime/runs/${started.json.run.run.runId}`);
  assert.equal(queriedRun.status, 200);
  assert.equal(queriedRun.json.run.run.status, 'completed');
  assert.equal(
    queriedRun.json.run.artifacts.filter((artifact) => artifact.artifactType === 'ActionReceipt').length,
    2,
  );
  assert.ok(queriedRun.json.run.artifacts.some((artifact) => artifact.artifactType === 'ValidationReport'));
  const deliverySummary = queriedRun.json.run.artifacts.find((artifact) => artifact.artifactType === 'DeliverySummary');
  assert.equal(deliverySummary?.state, 'published');

  const deliveryDetail = await httpGet(
    `http://127.0.0.1:${ports.runtime}/internal/runtime/artifacts/${deliverySummary.artifactId}`,
  );
  assert.equal(deliveryDetail.status, 200);
  assert.equal(deliveryDetail.json.typedPayload.disposition, 'ready_for_release');
  assert.equal(deliveryDetail.json.lineage.nodeKey, 'summarize_delivery');
});
