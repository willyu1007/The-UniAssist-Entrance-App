import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ports = {
  provider: 19790,
  runtime: 19792,
  platform: 19791,
  gateway: 19777,
};

const internalEnv = {
  UNIASSIST_INTERNAL_AUTH_MODE: 'enforce',
  UNIASSIST_INTERNAL_AUTH_ISSUER: 'uniassist-internal',
  UNIASSIST_INTERNAL_AUTH_KEYS_JSON: JSON.stringify({ 'kid-main': 'internal-secret-main' }),
  UNIASSIST_INTERNAL_AUTH_SIGNING_KID: 'kid-main',
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

async function pollUntil(fn, timeoutMs = 8_000, intervalMs = 250) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await fn();
    if (result) {
      return result;
    }
    await sleep(intervalMs);
  }
  throw new Error('poll timeout');
}

function findInteractionEvent(timeline, predicate) {
  return (timeline.events || [])
    .filter((event) => event.kind === 'interaction')
    .map((event) => ({ runId: event.runId, providerId: event.providerId, event: event.payload?.event }))
    .find((item) => predicate(item.event, item));
}

async function main() {
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
  const platform = startService('workflow-platform-api', ['--filter', '@baseinterface/workflow-platform-api', 'start'], {
    PORT: String(ports.platform),
    UNIASSIST_SERVICE_ID: 'workflow-platform-api',
    UNIASSIST_WORKFLOW_RUNTIME_BASE_URL: `http://127.0.0.1:${ports.runtime}`,
    ...internalEnv,
  });
  const gateway = startService('gateway', ['--filter', '@baseinterface/gateway', 'start'], {
    PORT: String(ports.gateway),
    UNIASSIST_SERVICE_ID: 'gateway',
    UNIASSIST_PLAN_PROVIDER_BASE_URL: `http://127.0.0.1:${ports.provider}`,
    UNIASSIST_WORKFLOW_ENTRY_ENABLED: 'true',
    UNIASSIST_WORKFLOW_PLATFORM_API_BASE_URL: `http://127.0.0.1:${ports.platform}`,
    UNIASSIST_WORKFLOW_ENTRY_REGISTRY_JSON: JSON.stringify([
      {
        compatProviderId: 'plan',
        workflowKey: 'plan-b1-workflow',
        matchKeywords: ['制定', '计划'],
        enabled: true,
        defaultExecutorId: 'compat-plan',
      },
    ]),
    ...internalEnv,
  });

  const stopAll = () => {
    provider.kill('SIGTERM');
    runtime.kill('SIGTERM');
    platform.kill('SIGTERM');
    gateway.kill('SIGTERM');
  };

  process.on('SIGINT', () => {
    stopAll();
    process.exit(1);
  });
  process.on('SIGTERM', () => {
    stopAll();
    process.exit(1);
  });

  try {
    await waitForHealth(`http://127.0.0.1:${ports.provider}/health`);
    await waitForHealth(`http://127.0.0.1:${ports.runtime}/health`);
    await waitForHealth(`http://127.0.0.1:${ports.platform}/health`);
    await waitForHealth(`http://127.0.0.1:${ports.gateway}/health`);

    const workflowSpec = {
      schemaVersion: 'v1',
      workflowKey: 'plan-b1-workflow',
      name: 'Plan Workflow Entry',
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

    const createdWorkflow = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflows`, {
      schemaVersion: 'v1',
      workflowKey: workflowSpec.workflowKey,
      name: workflowSpec.name,
      compatProviderId: workflowSpec.compatProviderId,
      spec: workflowSpec,
    });
    assert.equal(createdWorkflow.status, 201);

    const sessionId = 's-gateway-workflow';
    const userId = 'u-gateway-workflow';

    const ingest = await httpPost(`http://127.0.0.1:${ports.gateway}/v0/ingest`, {
      schemaVersion: 'v0',
      traceId: 'trace-workflow-ingest',
      userId,
      sessionId,
      source: 'app',
      text: '请帮我制定本周计划',
      timestampMs: Date.now(),
    });
    assert.equal(ingest.status, 200);
    assert.equal(ingest.json.runs[0].providerId, 'plan');

    const firstQuestion = await pollUntil(async () => {
      const timeline = await httpGet(`http://127.0.0.1:${ports.gateway}/v0/timeline?sessionId=${encodeURIComponent(sessionId)}&cursor=0`);
      return findInteractionEvent(timeline.json, (event) => (
        event?.type === 'provider_extension'
        && event.extensionKind === 'task_question'
        && event.payload?.metadata?.origin === 'workflow'
      ));
    });

    assert.ok(firstQuestion);
    const runId = firstQuestion.runId;

    const answerGoal = await httpPost(`http://127.0.0.1:${ports.gateway}/v0/interact`, {
      schemaVersion: 'v0',
      traceId: 'trace-workflow-answer-goal',
      sessionId,
      userId,
      providerId: 'plan',
      runId,
      actionId: 'answer_task_question',
      replyToken: firstQuestion.event.payload.replyToken,
      inReplyTo: {
        providerId: 'plan',
        runId,
        taskId: firstQuestion.event.payload.taskId,
        questionId: firstQuestion.event.payload.questionId,
      },
      payload: {
        text: '完成 B1 平台实施',
      },
      timestampMs: Date.now(),
    });
    assert.equal(answerGoal.status, 200);

    const dueDateQuestion = await pollUntil(async () => {
      const timeline = await httpGet(`http://127.0.0.1:${ports.gateway}/v0/timeline?sessionId=${encodeURIComponent(sessionId)}&cursor=0`);
      return findInteractionEvent(timeline.json, (event) => (
        event?.type === 'provider_extension'
        && event.extensionKind === 'task_question'
        && /dueDate/i.test(String(event.payload?.questionId || ''))
      ));
    });
    assert.ok(dueDateQuestion);

    const answerDueDate = await httpPost(`http://127.0.0.1:${ports.gateway}/v0/interact`, {
      schemaVersion: 'v0',
      traceId: 'trace-workflow-answer-due',
      sessionId,
      userId,
      providerId: 'plan',
      runId,
      actionId: 'answer_task_question',
      replyToken: dueDateQuestion.event.payload.replyToken,
      inReplyTo: {
        providerId: 'plan',
        runId,
        taskId: dueDateQuestion.event.payload.taskId,
        questionId: dueDateQuestion.event.payload.questionId,
      },
      payload: {
        text: '2026-03-31',
        dueDate: '2026-03-31',
      },
      timestampMs: Date.now(),
    });
    assert.equal(answerDueDate.status, 200);

    const readyState = await pollUntil(async () => {
      const timeline = await httpGet(`http://127.0.0.1:${ports.gateway}/v0/timeline?sessionId=${encodeURIComponent(sessionId)}&cursor=0`);
      return findInteractionEvent(timeline.json, (event) => (
        event?.type === 'provider_extension'
        && event.extensionKind === 'task_state'
        && event.payload?.state === 'ready'
        && event.payload?.metadata?.origin === 'workflow'
      ));
    });
    assert.ok(readyState);

    const execute = await httpPost(`http://127.0.0.1:${ports.gateway}/v0/interact`, {
      schemaVersion: 'v0',
      traceId: 'trace-workflow-execute',
      sessionId,
      userId,
      providerId: 'plan',
      runId,
      actionId: `execute_task:${readyState.event.payload.taskId}`,
      inReplyTo: {
        providerId: 'plan',
        runId,
        taskId: readyState.event.payload.taskId,
      },
      timestampMs: Date.now(),
    });
    assert.equal(execute.status, 200);

    const completedState = await pollUntil(async () => {
      const timeline = await httpGet(`http://127.0.0.1:${ports.gateway}/v0/timeline?sessionId=${encodeURIComponent(sessionId)}&cursor=0`);
      return findInteractionEvent(timeline.json, (event) => (
        event?.type === 'provider_extension'
        && event.extensionKind === 'task_state'
        && event.payload?.state === 'completed'
      ));
    });
    assert.ok(completedState);

    const artifactMessage = await pollUntil(async () => {
      const timeline = await httpGet(`http://127.0.0.1:${ports.gateway}/v0/timeline?sessionId=${encodeURIComponent(sessionId)}&cursor=0`);
      return findInteractionEvent(timeline.json, (event) => (
        event?.type === 'assistant_message'
        && String(event.text || '').includes('已生成结构化产物')
      ));
    });
    assert.ok(artifactMessage);
  } finally {
    stopAll();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
