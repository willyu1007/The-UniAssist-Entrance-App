import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../packages/convex-projection-experiment/convex/_generated/api.js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const convexPackageDir = resolve(rootDir, 'packages/convex-projection-experiment');
const convexEnvFile = resolve(convexPackageDir, '.env.local');

const ports = {
  provider: 19970,
  runtime: 19971,
  platform: 19972,
  platformFallback: 19973,
};

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function startService(name, args, env = {}, cwd = rootDir) {
  const child = spawn('pnpm', args, {
    cwd,
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

async function stopService(child, signal = 'SIGTERM') {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }
  await new Promise((resolvePromise) => {
    child.once('exit', resolvePromise);
    child.kill(signal);
  });
}

async function waitForCondition(fn, timeoutMs = 30_000, intervalMs = 250) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await fn();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('condition timeout');
}

async function waitForHealth(url, timeoutMs = 30_000) {
  await waitForCondition(async () => {
    try {
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }, timeoutMs);
}

function parseEnvFile(content) {
  return Object.fromEntries(
    content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

function readConvexUrlFromEnvFile() {
  if (!existsSync(convexEnvFile)) {
    return 'http://127.0.0.1:3210';
  }
  const env = parseEnvFile(readFileSync(convexEnvFile, 'utf8'));
  return env.CONVEX_URL || 'http://127.0.0.1:3210';
}

async function waitForConvexUrl() {
  return await waitForCondition(() => {
    if (!existsSync(convexEnvFile)) {
      return undefined;
    }
    const env = parseEnvFile(readFileSync(convexEnvFile, 'utf8'));
    return env.CONVEX_URL || undefined;
  });
}

async function isBackendAvailable(url) {
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/version`);
    return response.ok;
  } catch {
    return false;
  }
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

async function openSse(url) {
  const controller = new AbortController();
  const response = await fetch(url, {
    headers: {
      accept: 'text/event-stream',
    },
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.ok(response.body);

  return {
    controller,
    reader: response.body.getReader(),
    decoder: new TextDecoder(),
    buffer: '',
    pendingPayloads: [],
  };
}

async function readNextSsePayload(stream, timeoutMs = 10_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (stream.pendingPayloads.length > 0) {
      return stream.pendingPayloads.shift();
    }

    const frames = stream.buffer.split('\n\n');
    if (frames.length > 1) {
      stream.buffer = frames.pop() || '';
      for (const frame of frames) {
        const dataLine = frame
          .split('\n')
          .map((line) => line.trim())
          .find((line) => line.startsWith('data: '));
        if (dataLine) {
          stream.pendingPayloads.push(JSON.parse(dataLine.slice(6)));
        }
      }
      if (stream.pendingPayloads.length > 0) {
        return stream.pendingPayloads.shift();
      }
    }

    const remaining = Math.max(1, timeoutMs - (Date.now() - startedAt));
    const result = await Promise.race([
      stream.reader.read(),
      sleep(remaining).then(() => {
        throw new Error('sse read timeout');
      }),
    ]);
    if (result.done) {
      break;
    }
    stream.buffer += stream.decoder.decode(result.value, { stream: true });
  }

  throw new Error('sse stream ended before data event');
}

async function readNextConsoleEvent(stream, timeoutMs = 10_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const remaining = Math.max(1, timeoutMs - (Date.now() - startedAt));
    const payload = await readNextSsePayload(stream, remaining);
    if (payload.type === 'control_console_event') {
      return payload.event;
    }
  }

  throw new Error('control console event timeout');
}

async function collectConsoleEvents(stream, matchers, timeoutMs = 12_000) {
  const startedAt = Date.now();
  const matched = new Map();

  while (Date.now() - startedAt < timeoutMs && matched.size < matchers.length) {
    const remaining = Math.max(1, timeoutMs - (Date.now() - startedAt));
    const event = await readNextConsoleEvent(stream, remaining);
    for (const matcher of matchers) {
      if (!matched.has(matcher.key) && matcher.match(event)) {
        matched.set(matcher.key, event);
      }
    }
  }

  if (matched.size !== matchers.length) {
    throw new Error(`missing console events: ${matchers.filter((matcher) => !matched.has(matcher.key)).map((matcher) => matcher.key).join(', ')}`);
  }

  return Object.fromEntries(matched);
}

function canonicalizeRuns(runs) {
  return [...runs].sort((left, right) => {
    if (right.updatedAt !== left.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }
    return right.runId.localeCompare(left.runId);
  });
}

function buildWorkflowSpec(workflowKey, name) {
  return {
    schemaVersion: 'v1',
    workflowKey,
    name,
    compatProviderId: 'sample',
    entryNode: 'generate_assessment',
    nodes: [
      {
        nodeKey: 'generate_assessment',
        nodeType: 'executor',
        executorId: 'compat-sample',
        transitions: {
          success: 'teacher_review',
        },
      },
      {
        nodeKey: 'teacher_review',
        nodeType: 'approval_gate',
        config: {
          reviewArtifactTypes: ['AssessmentDraft', 'EvidencePack'],
        },
        transitions: {
          approved: 'finish',
          rejected: 'finish',
        },
      },
      {
        nodeKey: 'finish',
        nodeType: 'end',
      },
    ],
  };
}

function buildWorkflowInput(label) {
  return {
    subject: {
      subjectRef: `student:${label}`,
      subjectType: 'student',
      displayName: `Student ${label}`,
    },
    teacher: {
      actorId: `teacher:${label}`,
      displayName: `Teacher ${label}`,
    },
    audiences: ['guardian'],
    materials: [
      `${label} material 1`,
      `${label} material 2`,
    ],
  };
}

function buildRuntimeTemplate(spec, templateVersionId) {
  const timestamp = Date.now();
  const workflowId = `wf-${templateVersionId}`;

  return {
    template: {
      workflowId,
      workflowKey: spec.workflowKey,
      name: spec.name,
      compatProviderId: spec.compatProviderId,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    version: {
      templateVersionId,
      workflowId,
      workflowKey: spec.workflowKey,
      version: 1,
      status: 'published',
      spec,
      createdAt: timestamp,
    },
  };
}

function buildRuntimeStartRunRequest(spec, templateVersionId, label) {
  return {
    schemaVersion: 'v1',
    traceId: `trace-${label}`,
    sessionId: `session-${label}`,
    userId: `user-${label}`,
    sourceType: 'manual',
    inputPayload: buildWorkflowInput(label),
    ...buildRuntimeTemplate(spec, templateVersionId),
  };
}

async function listProjectionRuns(client, limit = 40) {
  return canonicalizeRuns(await client.query(api.runboard.listRecent, { limit }));
}

async function waitForProjectionRun(client, runId, predicate = () => true, timeoutMs = 30_000) {
  return await waitForCondition(async () => {
    const runs = await listProjectionRuns(client, 40);
    const run = runs.find((item) => item.runId === runId);
    if (run && predicate(run)) {
      return { run, runs };
    }
    return undefined;
  }, timeoutMs);
}

async function waitForPlatformRun(platformBaseUrl, runId, predicate = () => true, timeoutMs = 30_000) {
  return await waitForCondition(async () => {
    const response = await httpGet(`${platformBaseUrl}/v1/runs?limit=40`);
    assert.equal(response.status, 200);
    const run = response.json.runs.find((item) => item.runId === runId);
    if (run && predicate(run)) {
      return response.json;
    }
    return undefined;
  }, timeoutMs);
}

async function createAndPublishWorkflow(platformBaseUrl, spec, stream) {
  const createDraft = await httpPost(`${platformBaseUrl}/v1/workflow-drafts`, {
    schemaVersion: 'v1',
    sessionId: 'session-b9-draft',
    userId: 'owner-b9',
    workflowKey: spec.workflowKey,
    name: spec.name,
  });
  assert.equal(createDraft.status, 201);
  const draftId = createDraft.json.draft.draftId;

  const draftEvent = await collectConsoleEvents(stream, [
    {
      key: 'draft',
      match: (event) => event.kind === 'draft.updated' && event.draftId === draftId,
    },
  ]);
  assert.equal(draftEvent.draft.draftId, draftId);

  const detail = await httpGet(`${platformBaseUrl}/v1/workflow-drafts/${draftId}?sessionId=session-b9-draft`);
  assert.equal(detail.status, 200);

  const patchMetadata = await httpPatch(`${platformBaseUrl}/v1/workflow-drafts/${draftId}/spec`, {
    schemaVersion: 'v1',
    sessionId: 'session-b9-draft',
    userId: 'owner-b9',
    baseRevisionId: detail.json.revisions.at(-1).revisionId,
    changeSummary: 'Set provider metadata',
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
    sessionId: 'session-b9-draft',
    userId: 'owner-b9',
    baseRevisionId: patchMetadata.json.revision.revisionId,
    changeSummary: 'Set B9 workflow nodes',
    patch: {
      section: 'nodes',
      value: {
        entryNode: spec.entryNode,
        nodes: spec.nodes,
      },
    },
  });
  assert.equal(patchNodes.status, 200);

  const validateDraft = await httpPost(`${platformBaseUrl}/v1/workflow-drafts/${draftId}/validate`, {
    schemaVersion: 'v1',
    sessionId: 'session-b9-draft',
    userId: 'owner-b9',
  });
  assert.equal(validateDraft.status, 200);
  assert.equal(validateDraft.json.draft.publishable, true);

  const publishDraft = await httpPost(`${platformBaseUrl}/v1/workflow-drafts/${draftId}/publish`, {
    schemaVersion: 'v1',
    sessionId: 'session-b9-draft',
    userId: 'owner-b9',
  });
  assert.equal(publishDraft.status, 200);

  return {
    draftId,
    templateVersionId: publishDraft.json.version.templateVersionId,
  };
}

test('workflow platform api projects the B9 runboard slice through Convex with transparent fallback', async (t) => {
  let convex;
  let provider;
  let runtime;
  let platform;
  let stream;

  t.after(async () => {
    stream?.controller.abort();
    await stopService(platform);
    await stopService(runtime);
    await stopService(provider);
    await stopService(convex, 'SIGINT');
  });

  let convexUrl = readConvexUrlFromEnvFile();
  if (!(await isBackendAvailable(convexUrl))) {
    convex = startService(
      'convex-b9',
      ['exec', 'convex', 'dev', '--typecheck', 'disable', '--tail-logs', 'disable'],
      {
        CONVEX_AGENT_MODE: 'anonymous',
      },
      convexPackageDir,
    );
    convexUrl = await waitForConvexUrl();
  }
  const convexClient = new ConvexHttpClient(convexUrl);
  await waitForCondition(async () => {
    return await isBackendAvailable(convexUrl);
  });

  provider = startService('provider-sample-b9', ['--filter', '@baseinterface/provider-sample', 'start'], {
    PORT: String(ports.provider),
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
  });
  runtime = startService('workflow-runtime-b9', ['--filter', '@baseinterface/workflow-runtime', 'start'], {
    PORT: String(ports.runtime),
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
    UNIASSIST_SAMPLE_PROVIDER_BASE_URL: `http://127.0.0.1:${ports.provider}`,
  });

  await waitForHealth(`http://127.0.0.1:${ports.provider}/health`);
  await waitForHealth(`http://127.0.0.1:${ports.runtime}/health`);

  const bootstrapSpec = buildWorkflowSpec('b9-bootstrap-runtime', 'B9 Bootstrap Runtime');
  const bootstrapRun = await httpPost(
    `http://127.0.0.1:${ports.runtime}/internal/runtime/start-run`,
    buildRuntimeStartRunRequest(bootstrapSpec, 'ver-b9-bootstrap', 'b9-bootstrap'),
  );
  assert.equal(bootstrapRun.status, 200);
  const bootstrapRunId = bootstrapRun.json.run.run.runId;
  assert.equal(bootstrapRun.json.run.run.status, 'waiting_approval');
  assert.ok(bootstrapRun.json.run.approvals.length > 0);
  assert.ok(bootstrapRun.json.run.artifacts.length > 0);

  platform = startService('platform-b9', ['--filter', '@baseinterface/workflow-platform-api', 'start'], {
    PORT: String(ports.platform),
    UNIASSIST_WORKFLOW_RUNTIME_BASE_URL: `http://127.0.0.1:${ports.runtime}`,
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
    UNIASSIST_ENABLE_CONVEX_RUNBOARD_EXPERIMENT: 'true',
    UNIASSIST_CONVEX_URL: convexUrl,
  });
  const platformBaseUrl = `http://127.0.0.1:${ports.platform}`;

  await waitForHealth(`${platformBaseUrl}/health`);
  stream = await openSse(`${platformBaseUrl}/v1/control-console/stream`);

  const bootstrapProjection = await waitForProjectionRun(convexClient, bootstrapRunId);
  const bootstrapList = await waitForPlatformRun(platformBaseUrl, bootstrapRunId);
  assert.deepEqual(
    canonicalizeRuns(bootstrapList.runs),
    canonicalizeRuns(bootstrapProjection.runs),
  );

  const workflowSpec = buildWorkflowSpec('b9-convex-runboard', 'B9 Convex Runboard');
  await createAndPublishWorkflow(platformBaseUrl, workflowSpec, stream);

  await sleep(1500);

  const startRun = await httpPost(`${platformBaseUrl}/v1/runs`, {
    schemaVersion: 'v1',
    traceId: 'trace-b9-public-run',
    sessionId: 'session-b9-public',
    userId: 'user-b9-public',
    workflowKey: workflowSpec.workflowKey,
    inputPayload: buildWorkflowInput('b9-public'),
  });
  assert.equal(startRun.status, 201);
  const projectionRunId = startRun.json.run.run.runId;
  assert.equal(startRun.json.run.run.status, 'waiting_approval');

  const initialRunEvents = await collectConsoleEvents(stream, [
    {
      key: 'run',
      match: (event) => event.kind === 'run.updated' && event.runId === projectionRunId,
    },
    {
      key: 'approval',
      match: (event) => event.kind === 'approval.updated' && event.runId === projectionRunId,
    },
    {
      key: 'artifact',
      match: (event) => event.kind === 'artifact.updated' && event.runId === projectionRunId,
    },
  ]);
  assert.equal(initialRunEvents.run.runId, projectionRunId);
  assert.equal(initialRunEvents.approval.runId, projectionRunId);
  assert.equal(initialRunEvents.artifact.runId, projectionRunId);

  const projectedWaitingRun = await waitForProjectionRun(
    convexClient,
    projectionRunId,
    (run) => run.status === 'waiting_approval' && run.pendingApprovalCount === 1,
  );
  const projectedWaitingList = await waitForPlatformRun(
    platformBaseUrl,
    projectionRunId,
    (run) => run.status === 'waiting_approval' && run.pendingApprovalCount === 1,
  );
  assert.deepEqual(
    canonicalizeRuns(projectedWaitingList.runs),
    canonicalizeRuns(projectedWaitingRun.runs),
  );

  const waitingDetail = await httpGet(`${platformBaseUrl}/v1/runs/${projectionRunId}`);
  assert.equal(waitingDetail.status, 200);
  assert.equal(waitingDetail.json.run.run.status, 'waiting_approval');
  assert.ok(waitingDetail.json.run.artifacts.length > 0);
  assert.ok(waitingDetail.json.run.approvals.length > 0);

  const approvalQueue = await httpGet(`${platformBaseUrl}/v1/approvals/queue`);
  assert.equal(approvalQueue.status, 200);
  const queueItem = approvalQueue.json.approvals.find((item) => item.runId === projectionRunId);
  assert.ok(queueItem);

  const decideApproval = await httpPost(`${platformBaseUrl}/v1/approvals/${queueItem.approvalRequestId}/decision`, {
    schemaVersion: 'v1',
    traceId: 'trace-b9-approve',
    userId: 'reviewer-b9',
    decision: 'approved',
    comment: 'B9 approval accepted',
  });
  assert.equal(decideApproval.status, 200);
  assert.equal(decideApproval.json.run.run.status, 'completed');

  const completedRunEvents = await collectConsoleEvents(stream, [
    {
      key: 'run',
      match: (event) => event.kind === 'run.updated' && event.runId === projectionRunId,
    },
    {
      key: 'approval',
      match: (event) => event.kind === 'approval.updated' && event.approvalRequestId === queueItem.approvalRequestId,
    },
  ]);
  assert.equal(completedRunEvents.run.runId, projectionRunId);
  assert.equal(completedRunEvents.approval.approvalRequestId, queueItem.approvalRequestId);

  const projectedCompletedRun = await waitForProjectionRun(
    convexClient,
    projectionRunId,
    (run) => run.status === 'completed' && run.pendingApprovalCount === 0,
  );
  const projectedCompletedList = await waitForPlatformRun(
    platformBaseUrl,
    projectionRunId,
    (run) => run.status === 'completed' && run.pendingApprovalCount === 0,
  );
  assert.deepEqual(
    canonicalizeRuns(projectedCompletedList.runs),
    canonicalizeRuns(projectedCompletedRun.runs),
  );

  const completedDetail = await httpGet(`${platformBaseUrl}/v1/runs/${projectionRunId}`);
  assert.equal(completedDetail.status, 200);
  assert.equal(completedDetail.json.run.run.status, 'completed');
  assert.ok(completedDetail.json.run.approvals.some((item) => item.approvalRequestId === queueItem.approvalRequestId && item.status === 'approved'));
  assert.ok(completedDetail.json.run.artifacts.length > 0);

  await convexClient.mutation(api.runboard.bootstrap, {
    limit: 40,
    projectedAt: Date.now(),
    runs: [],
  });
  await waitForCondition(async () => {
    const runs = await listProjectionRuns(convexClient, 40);
    return runs.length === 0 ? runs : undefined;
  }, 5_000, 10);

  const recoveredPlatformList = await waitForPlatformRun(
    platformBaseUrl,
    projectionRunId,
    (run) => run.status === 'completed' && run.pendingApprovalCount === 0,
  );
  assert.ok(recoveredPlatformList.runs.some((item) => item.runId === projectionRunId));

  const recoveredProjectionRun = await waitForProjectionRun(
    convexClient,
    projectionRunId,
    (run) => run.status === 'completed' && run.pendingApprovalCount === 0,
  );
  assert.deepEqual(
    canonicalizeRuns(recoveredPlatformList.runs),
    canonicalizeRuns(recoveredProjectionRun.runs),
  );

  stream.controller.abort();
  stream = undefined;
  await stopService(platform);

  platform = startService('platform-b9-fallback', ['--filter', '@baseinterface/workflow-platform-api', 'start'], {
    PORT: String(ports.platformFallback),
    UNIASSIST_WORKFLOW_RUNTIME_BASE_URL: `http://127.0.0.1:${ports.runtime}`,
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
    UNIASSIST_ENABLE_CONVEX_RUNBOARD_EXPERIMENT: 'true',
    UNIASSIST_CONVEX_URL: 'not-a-url',
  });
  const fallbackPlatformBaseUrl = `http://127.0.0.1:${ports.platformFallback}`;
  await waitForHealth(`${fallbackPlatformBaseUrl}/health`);
  stream = await openSse(`${fallbackPlatformBaseUrl}/v1/control-console/stream`);

  const unavailableList = await waitForPlatformRun(
    fallbackPlatformBaseUrl,
    projectionRunId,
    (run) => run.status === 'completed' && run.pendingApprovalCount === 0,
  );
  assert.ok(unavailableList.runs.some((item) => item.runId === projectionRunId));

  const fallbackWorkflowSpec = buildWorkflowSpec('b9-convex-runboard-fallback', 'B9 Convex Runboard Fallback');
  await createAndPublishWorkflow(fallbackPlatformBaseUrl, fallbackWorkflowSpec, stream);

  const fallbackRun = await httpPost(`${fallbackPlatformBaseUrl}/v1/runs`, {
    schemaVersion: 'v1',
    traceId: 'trace-b9-fallback-run',
    sessionId: 'session-b9-fallback',
    userId: 'user-b9-fallback',
    workflowKey: fallbackWorkflowSpec.workflowKey,
    inputPayload: buildWorkflowInput('b9-fallback'),
  });
  assert.equal(fallbackRun.status, 201);
  const fallbackRunId = fallbackRun.json.run.run.runId;
  assert.equal(fallbackRun.json.run.run.status, 'waiting_approval');

  const fallbackEvents = await collectConsoleEvents(stream, [
    {
      key: 'run',
      match: (event) => event.kind === 'run.updated' && event.runId === fallbackRunId,
    },
    {
      key: 'approval',
      match: (event) => event.kind === 'approval.updated' && event.runId === fallbackRunId,
    },
    {
      key: 'artifact',
      match: (event) => event.kind === 'artifact.updated' && event.runId === fallbackRunId,
    },
  ]);
  assert.equal(fallbackEvents.run.runId, fallbackRunId);
  assert.equal(fallbackEvents.approval.runId, fallbackRunId);
  assert.equal(fallbackEvents.artifact.runId, fallbackRunId);

  const fallbackList = await waitForPlatformRun(
    fallbackPlatformBaseUrl,
    fallbackRunId,
    (run) => run.status === 'waiting_approval' && run.pendingApprovalCount === 1,
  );
  const fallbackSummary = fallbackList.runs.find((item) => item.runId === fallbackRunId);
  assert.ok(fallbackSummary);
  assert.equal(fallbackSummary.status, 'waiting_approval');
  assert.equal(fallbackSummary.pendingApprovalCount, 1);

  const fallbackDetail = await httpGet(`${fallbackPlatformBaseUrl}/v1/runs/${fallbackRunId}`);
  assert.equal(fallbackDetail.status, 200);
  assert.equal(fallbackDetail.json.run.run.status, 'waiting_approval');
  assert.ok(fallbackDetail.json.run.approvals.length > 0);
  assert.ok(fallbackDetail.json.run.artifacts.length > 0);
});
