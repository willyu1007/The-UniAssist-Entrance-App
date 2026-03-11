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
  const provider = startService('provider-sample', ['--filter', '@baseinterface/provider-sample', 'start'], {
    PORT: String(ports.provider),
    UNIASSIST_SERVICE_ID: 'provider-sample',
    ...internalEnv,
  });
  const runtime = startService('workflow-runtime', ['--filter', '@baseinterface/workflow-runtime', 'start'], {
    PORT: String(ports.runtime),
    UNIASSIST_SERVICE_ID: 'workflow-runtime',
    UNIASSIST_SAMPLE_PROVIDER_BASE_URL: `http://127.0.0.1:${ports.provider}`,
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
    UNIASSIST_SAMPLE_PROVIDER_BASE_URL: `http://127.0.0.1:${ports.provider}`,
    UNIASSIST_WORKFLOW_ENTRY_ENABLED: 'true',
    UNIASSIST_WORKFLOW_PLATFORM_API_BASE_URL: `http://127.0.0.1:${ports.platform}`,
    UNIASSIST_WORKFLOW_ENTRY_REGISTRY_JSON: JSON.stringify([
      {
        compatProviderId: 'sample',
        workflowKey: 'sample-b1-workflow',
        matchKeywords: ['样例', '评估'],
        enabled: true,
        defaultExecutorId: 'compat-sample',
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

    async function publishWorkflowSeed({
      sessionId,
      userId,
      workflowKey,
      name,
      initialText,
    }) {
      const createdDraft = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts`, {
        schemaVersion: 'v1',
        sessionId,
        userId,
        workflowKey,
        name,
        source: 'builder_text_entry',
        initialText,
      });
      assert.equal(createdDraft.status, 201);

      const draftId = createdDraft.json.draft.draftId;

      const synthesized = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/synthesize`, {
        schemaVersion: 'v1',
        sessionId,
        userId,
      });
      assert.equal(synthesized.status, 200);

      const validated = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/validate`, {
        schemaVersion: 'v1',
        sessionId,
        userId,
      });
      assert.equal(validated.status, 200);
      assert.equal(validated.json.draft.publishable, true);

      const published = await httpPost(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts/${draftId}/publish`, {
        schemaVersion: 'v1',
        sessionId,
        userId,
      });
      assert.equal(published.status, 200);

      return {
        draftId,
        published,
      };
    }

    const builderSessionId = 's-gateway-builder';
    const builderUserId = 'u-gateway-builder';

    const builderQuickEntry = await httpPost(`http://127.0.0.1:${ports.gateway}/v0/ingest`, {
      schemaVersion: 'v0',
      traceId: 'trace-builder-quick',
      userId: builderUserId,
      sessionId: builderSessionId,
      source: 'app',
      text: '',
      raw: {
        entryMode: 'workflow_builder',
      },
      timestampMs: Date.now(),
    });
    assert.equal(builderQuickEntry.status, 200);
    assert.equal(builderQuickEntry.json.runs.length, 0);
    assert.equal(builderQuickEntry.json.routing.candidates[0].providerId, 'workflow_builder');

    const builderCard = await pollUntil(async () => {
      const timeline = await httpGet(`http://127.0.0.1:${ports.gateway}/v0/timeline?sessionId=${encodeURIComponent(builderSessionId)}&cursor=0`);
      return findInteractionEvent(timeline.json, (event) => (
        event?.type === 'card'
        && event.title === 'Builder 草稿'
      ));
    });
    assert.ok(builderCard);

    const builderDraftsAfterQuickEntry = await httpGet(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts?sessionId=${encodeURIComponent(builderSessionId)}`);
    assert.equal(builderDraftsAfterQuickEntry.status, 200);
    assert.equal(builderDraftsAfterQuickEntry.json.drafts.length, 1);
    const firstBuilderDraftId = builderDraftsAfterQuickEntry.json.drafts[0].draftId;

    const builderPrefixEntry = await httpPost(`http://127.0.0.1:${ports.gateway}/v0/ingest`, {
      schemaVersion: 'v0',
      traceId: 'trace-builder-prefix',
      userId: builderUserId,
      sessionId: builderSessionId,
      source: 'app',
      text: '@builder 需要一个留学申请材料收集流程',
      timestampMs: Date.now(),
    });
    assert.equal(builderPrefixEntry.status, 200);
    assert.equal(builderPrefixEntry.json.runs.length, 0);
    assert.equal(builderPrefixEntry.json.routing.candidates[0].providerId, 'workflow_builder');

    const builderDraftsAfterPrefix = await httpGet(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts?sessionId=${encodeURIComponent(builderSessionId)}`);
    assert.equal(builderDraftsAfterPrefix.status, 200);
    assert.equal(builderDraftsAfterPrefix.json.drafts.length, 1);
    assert.equal(builderDraftsAfterPrefix.json.drafts[0].draftId, firstBuilderDraftId);
    assert.equal(builderDraftsAfterPrefix.json.drafts[0].activeRevisionNumber, 2);

    const builderSynthesize = await httpPost(`http://127.0.0.1:${ports.gateway}/v0/interact`, {
      schemaVersion: 'v0',
      traceId: 'trace-builder-synthesize',
      sessionId: builderSessionId,
      userId: builderUserId,
      providerId: 'workflow_builder',
      runId: firstBuilderDraftId,
      actionId: `builder_synthesize:${firstBuilderDraftId}`,
      timestampMs: Date.now(),
    });
    assert.equal(builderSynthesize.status, 200);

    const builderValidate = await httpPost(`http://127.0.0.1:${ports.gateway}/v0/interact`, {
      schemaVersion: 'v0',
      traceId: 'trace-builder-validate',
      sessionId: builderSessionId,
      userId: builderUserId,
      providerId: 'workflow_builder',
      runId: firstBuilderDraftId,
      actionId: `builder_validate:${firstBuilderDraftId}`,
      timestampMs: Date.now(),
    });
    assert.equal(builderValidate.status, 200);

    const publishPrompt = await pollUntil(async () => {
      const timeline = await httpGet(`http://127.0.0.1:${ports.gateway}/v0/timeline?sessionId=${encodeURIComponent(builderSessionId)}&cursor=0`);
      return findInteractionEvent(timeline.json, (event) => (
        event?.type === 'card'
        && event.title === 'Builder 草稿'
        && Array.isArray(event.actions)
        && event.actions.some((action) => action.actionId === `builder_publish:${firstBuilderDraftId}`)
      ));
    });
    assert.ok(publishPrompt);

    const builderPublish = await httpPost(`http://127.0.0.1:${ports.gateway}/v0/interact`, {
      schemaVersion: 'v0',
      traceId: 'trace-builder-publish',
      sessionId: builderSessionId,
      userId: builderUserId,
      providerId: 'workflow_builder',
      runId: firstBuilderDraftId,
      actionId: `builder_publish:${firstBuilderDraftId}`,
      timestampMs: Date.now(),
    });
    assert.equal(builderPublish.status, 200);

    const builderPublishedMessage = await pollUntil(async () => {
      const timeline = await httpGet(`http://127.0.0.1:${ports.gateway}/v0/timeline?sessionId=${encodeURIComponent(builderSessionId)}&cursor=0`);
      return findInteractionEvent(timeline.json, (event) => (
        event?.type === 'assistant_message'
        && String(event.text || '').includes('已完成 Builder 草稿发布')
      ));
    });
    assert.ok(builderPublishedMessage);

    const publishedBuilderCard = await pollUntil(async () => {
      const timeline = await httpGet(`http://127.0.0.1:${ports.gateway}/v0/timeline?sessionId=${encodeURIComponent(builderSessionId)}&cursor=0`);
      return findInteractionEvent(timeline.json, (event) => (
        event?.type === 'card'
        && event.title === 'Builder 草稿'
        && String(event.body || '').includes('状态：已发布')
      ));
    });
    assert.ok(publishedBuilderCard);
    assert.equal(publishedBuilderCard.event.actions?.length || 0, 0);

    const builderSecondQuickEntry = await httpPost(`http://127.0.0.1:${ports.gateway}/v0/ingest`, {
      schemaVersion: 'v0',
      traceId: 'trace-builder-second-quick',
      userId: builderUserId,
      sessionId: builderSessionId,
      source: 'app',
      text: '',
      raw: {
        entryMode: 'workflow_builder',
      },
      timestampMs: Date.now(),
    });
    assert.equal(builderSecondQuickEntry.status, 200);

    const builderDraftsAfterSecondQuickEntry = await httpGet(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts?sessionId=${encodeURIComponent(builderSessionId)}`);
    assert.equal(builderDraftsAfterSecondQuickEntry.status, 200);
    assert.equal(builderDraftsAfterSecondQuickEntry.json.drafts.length, 2);
    const secondBuilderDraftId = builderDraftsAfterSecondQuickEntry.json.sessionLinks.find((link) => link.isActive).draftId;
    assert.notEqual(secondBuilderDraftId, firstBuilderDraftId);

    const focusFirstDraft = await httpPost(`http://127.0.0.1:${ports.gateway}/v0/interact`, {
      schemaVersion: 'v0',
      traceId: 'trace-builder-focus-first',
      sessionId: builderSessionId,
      userId: builderUserId,
      providerId: 'workflow_builder',
      runId: firstBuilderDraftId,
      actionId: `builder_focus:${firstBuilderDraftId}`,
      timestampMs: Date.now(),
    });
    assert.equal(focusFirstDraft.status, 200);

    const focusedFirstLinks = await httpGet(`http://127.0.0.1:${ports.platform}/v1/workflow-drafts?sessionId=${encodeURIComponent(builderSessionId)}`);
    assert.equal(focusedFirstLinks.status, 200);
    assert.equal(focusedFirstLinks.json.sessionLinks.find((link) => link.isActive).draftId, firstBuilderDraftId);

    const workflowSeed = await publishWorkflowSeed({
      sessionId: 's-seed-workflow-entry',
      userId: 'u-seed-workflow-entry',
      workflowKey: 'sample-b1-workflow',
      name: 'Sample Workflow Entry',
      initialText: '创建一个样例工作流供入口测试使用',
    });
    assert.equal(workflowSeed.published.json.version.status, 'published');

    const sessionId = 's-gateway-workflow';
    const userId = 'u-gateway-workflow';

    const ingest = await httpPost(`http://127.0.0.1:${ports.gateway}/v0/ingest`, {
      schemaVersion: 'v0',
      traceId: 'trace-workflow-ingest',
      userId,
      sessionId,
      source: 'app',
      text: '请帮我生成一个样例评估',
      timestampMs: Date.now(),
    });
    assert.equal(ingest.status, 200);
    assert.equal(ingest.json.runs[0].providerId, 'sample');
    assert.ok(ingest.json.ackEvents.some((event) => String(event.message || '').includes('已按 workflow 路由到 sample 专项')));

    const artifactMessage = await pollUntil(async () => {
      const timeline = await httpGet(`http://127.0.0.1:${ports.gateway}/v0/timeline?sessionId=${encodeURIComponent(sessionId)}&cursor=0`);
      return findInteractionEvent(timeline.json, (event) => (
        event?.type === 'assistant_message'
        && String(event.text || '').includes('已生成结构化产物 executor_result')
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
