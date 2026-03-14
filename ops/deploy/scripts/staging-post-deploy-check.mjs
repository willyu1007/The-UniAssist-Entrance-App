#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

function nowMs() {
  return Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing required env: ${name}`);
  }
  return value.replace(/\/$/, '');
}

function optionalEnv(name) {
  const value = process.env[name];
  return value ? value.replace(/\/$/, '') : '';
}

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

async function patchJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

async function waitFor(label, fn, timeoutMs, intervalMs = 500) {
  const startedAt = nowMs();
  while (nowMs() - startedAt < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await sleep(intervalMs);
  }
  throw new Error(`${label} timeout after ${timeoutMs}ms`);
}

async function assertHealth(baseUrl, name) {
  const response = await getJson(`${baseUrl}/health`);
  assert.equal(response.status, 200, `${name} health check failed with status ${response.status}`);
  assert.equal(response.json?.ok, true, `${name} health response missing ok=true`);
  return response.json;
}

async function assertHtml(baseUrl, name) {
  const response = await fetch(baseUrl);
  const text = await response.text();
  assert.equal(response.status, 200, `${name} root check failed with status ${response.status}`);
  assert.match(text, /<html/i, `${name} root response did not look like html`);
  return { ok: true };
}

function buildSmokeNodes() {
  return [
    {
      nodeKey: 'emit_artifact',
      nodeType: 'executor',
      executorId: 'platform.emit_artifact',
      config: {
        artifactType: 'StagingSmokeArtifact',
        state: 'generated',
        payloadMode: 'input',
      },
      transitions: {
        success: 'finish',
      },
    },
    {
      nodeKey: 'finish',
      nodeType: 'end',
    },
  ];
}

async function main() {
  const controlConsoleBase = requiredEnv('STAGING_CONTROL_CONSOLE_BASE_URL');
  const platformBase = requiredEnv('STAGING_WORKFLOW_PLATFORM_API_BASE_URL');
  const runtimeBase = optionalEnv('STAGING_WORKFLOW_RUNTIME_BASE_URL');
  const connectorBase = optionalEnv('STAGING_CONNECTOR_RUNTIME_BASE_URL');
  const schedulerBase = optionalEnv('STAGING_TRIGGER_SCHEDULER_BASE_URL');
  const timeoutMs = toInt(process.env.STAGING_VERIFY_TIMEOUT_MS, 30_000);

  const health = {
    controlConsole: await assertHtml(controlConsoleBase, 'control-console'),
    workflowPlatformApi: await assertHealth(platformBase, 'workflow-platform-api'),
  };

  if (runtimeBase) {
    health.workflowRuntime = await assertHealth(runtimeBase, 'workflow-runtime');
  }
  if (connectorBase) {
    health.connectorRuntime = await assertHealth(connectorBase, 'connector-runtime');
  }
  if (schedulerBase) {
    health.triggerScheduler = await assertHealth(schedulerBase, 'trigger-scheduler');
  }

  const runToken = randomUUID().slice(0, 8);
  const sessionId = `staging-session-${runToken}`;
  const userId = `staging-user-${runToken}`;
  const traceId = `staging-trace-${runToken}`;
  const workflowKey = `staging-smoke-${runToken}`;

  const createDraft = await postJson(`${platformBase}/v1/workflow-drafts`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
    workflowKey,
    name: `Staging Smoke ${runToken}`,
  });
  assert.equal(createDraft.status, 201, `create draft failed with status ${createDraft.status}`);
  const draftId = createDraft.json?.draft?.draftId;
  const baseRevisionId = createDraft.json?.revision?.revisionId;
  assert.ok(draftId, 'create draft response missing draftId');
  assert.ok(baseRevisionId, 'create draft response missing base revision');

  const patchNodes = await patchJson(`${platformBase}/v1/workflow-drafts/${draftId}/spec`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
    baseRevisionId,
    changeSummary: 'Install pure-v1 staging smoke nodes',
    patch: {
      section: 'nodes',
      value: {
        entryNode: 'emit_artifact',
        nodes: buildSmokeNodes(),
      },
    },
  });
  assert.equal(patchNodes.status, 200, `patch nodes failed with status ${patchNodes.status}`);

  const validateDraft = await postJson(`${platformBase}/v1/workflow-drafts/${draftId}/validate`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
  });
  assert.equal(validateDraft.status, 200, `validate draft failed with status ${validateDraft.status}`);
  assert.equal(validateDraft.json?.draft?.publishable, true, 'validated draft is not publishable');

  const publishDraft = await postJson(`${platformBase}/v1/workflow-drafts/${draftId}/publish`, {
    schemaVersion: 'v1',
    sessionId,
    userId,
  });
  assert.equal(publishDraft.status, 200, `publish draft failed with status ${publishDraft.status}`);
  const templateVersionId = publishDraft.json?.version?.templateVersionId;
  assert.ok(templateVersionId, 'publish response missing templateVersionId');

  const startRun = await postJson(`${platformBase}/v1/runs`, {
    schemaVersion: 'v1',
    traceId,
    sessionId,
    userId,
    workflowTemplateVersionId: templateVersionId,
    inputPayload: {
      smoke: {
        token: runToken,
        source: 'staging-post-deploy-check',
      },
    },
  });
  assert.equal(startRun.status, 201, `start run failed with status ${startRun.status}`);
  const runId = startRun.json?.run?.run?.runId;
  assert.ok(runId, 'start run response missing runId');

  const finalRun = await waitFor(
    'pure-v1 smoke run completion',
    async () => {
      const detail = await getJson(`${platformBase}/v1/runs/${runId}`);
      if (detail.status !== 200) return null;
      if (detail.json?.run?.run?.status === 'completed') {
        return detail.json;
      }
      return null;
    },
    timeoutMs,
  );

  assert.equal(finalRun.run.run.status, 'completed');
  assert.ok(Array.isArray(finalRun.run.artifacts), 'run detail missing artifacts array');
  assert.ok(finalRun.run.artifacts.length >= 1, 'smoke run did not produce artifact output');

  console.log('[staging-verify][PASS] pure-v1 post-deploy checks passed');
  console.log('[staging-verify][SUMMARY]', {
    controlConsoleBase,
    platformBase,
    runtimeBase: runtimeBase || '(skipped)',
    connectorBase: connectorBase || '(skipped)',
    schedulerBase: schedulerBase || '(skipped)',
    health,
    smoke: {
      workflowKey,
      draftId,
      templateVersionId,
      runId,
      artifactCount: finalRun.run.artifacts.length,
    },
  });
}

main().catch((error) => {
  console.error('[staging-verify][FAIL]', error);
  process.exit(1);
});
