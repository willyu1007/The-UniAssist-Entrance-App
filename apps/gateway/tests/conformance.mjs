import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const cwd = '/Volumes/DataDisk/Project/The-UA-Entrance-APP';

const ports = {
  provider: 9890,
  gateway: 9877,
  adapter: 9878,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowMs() {
  return Date.now();
}

function startService(name, args, env = {}) {
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

async function waitForHealth(name, url, timeoutMs = 20_000) {
  const start = nowMs();
  while (nowMs() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // keep retrying
    }
    await sleep(300);
  }
  throw new Error(`${name} health timeout: ${url}`);
}

async function httpPost(url, body, headers = {}) {
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
  return { status: res.status, json };
}

async function httpGet(url, headers = {}) {
  const res = await fetch(url, {
    headers,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function pollUntil(fn, timeoutMs = 8_000, intervalMs = 300) {
  const start = nowMs();
  while (nowMs() - start < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await sleep(intervalMs);
  }
  throw new Error('poll timeout');
}

function buildInput({ sessionId, userId = 'u-conformance', text, timestampMs }) {
  return {
    schemaVersion: 'v0',
    traceId: randomUUID(),
    userId,
    sessionId,
    source: 'app',
    text,
    timestampMs: timestampMs ?? nowMs(),
  };
}

function findInteractionEvents(timeline) {
  return (timeline?.events || [])
    .filter((event) => event.kind === 'interaction')
    .map((event) => ({ runId: event.runId, providerId: event.providerId, event: event.payload?.event || {} }));
}

function hasKind(timeline, kind) {
  return (timeline?.events || []).some((event) => event.kind === kind);
}

async function run() {
  const provider = startService('provider-plan', ['--filter', '@baseinterface/provider-plan', 'start'], {
    PORT: String(ports.provider),
  });
  const gateway = startService('gateway', ['--filter', '@baseinterface/gateway', 'start'], {
    PORT: String(ports.gateway),
    UNIASSIST_PLAN_PROVIDER_BASE_URL: `http://localhost:${ports.provider}`,
  });
  const adapter = startService('adapter-wechat', ['--filter', '@baseinterface/adapter-wechat', 'start'], {
    PORT: String(ports.adapter),
    GATEWAY_URL: `http://localhost:${ports.gateway}`,
    UNIASSIST_ADAPTER_SECRET: 'dev-adapter-secret',
  });

  const stopAll = () => {
    provider.kill('SIGTERM');
    gateway.kill('SIGTERM');
    adapter.kill('SIGTERM');
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
    await waitForHealth('provider', `http://localhost:${ports.provider}/health`);
    await waitForHealth('gateway', `http://localhost:${ports.gateway}/health`);
    await waitForHealth('adapter', `http://localhost:${ports.adapter}/health`);

    // 0) observability endpoints
    const metricsJson = await httpGet(`http://localhost:${ports.gateway}/v0/metrics`);
    assert.equal(metricsJson.status, 200);
    assert.equal(metricsJson.json.service, 'gateway');
    assert.ok(metricsJson.json.metrics?.ingest);

    const metricsText = await httpGet(`http://localhost:${ports.gateway}/metrics`);
    assert.equal(metricsText.status, 200);
    assert.match(metricsText.json.raw || '', /uniassist_gateway_ingest_total/);
    assert.match(metricsText.json.raw || '', /uniassist_outbox_backlog_total/);

    // 1) 未命中兜底
    const sessionFallback = 's-conf-fallback';
    const fallbackIngest = await httpPost(
      `http://localhost:${ports.gateway}/v0/ingest`,
      buildInput({ sessionId: sessionFallback, text: '你好啊，随便聊聊' }),
    );
    assert.equal(fallbackIngest.status, 200);
    assert.equal(fallbackIngest.json.routing.fallback, 'builtin_chat');
    assert.equal(fallbackIngest.json.runs[0].providerId, 'builtin_chat');

    const timelineFallback = await httpGet(
      `http://localhost:${ports.gateway}/v0/timeline?sessionId=${encodeURIComponent(sessionFallback)}&cursor=0`,
    );
    assert.equal(timelineFallback.status, 200);
    assert.ok(hasKind(timelineFallback.json, 'routing_decision'));
    assert.ok(hasKind(timelineFallback.json, 'provider_run'));
    assert.ok(hasKind(timelineFallback.json, 'interaction'));

    // 2) 结构化资料收集（request/progress/result）
    const sessionDataCollection = 's-conf-data';
    const planIngest = await httpPost(
      `http://localhost:${ports.gateway}/v0/ingest`,
      buildInput({ sessionId: sessionDataCollection, text: '请帮我制定本周计划' }),
    );
    assert.equal(planIngest.status, 200);
    const runId = planIngest.json.runs[0].runId;
    assert.equal(planIngest.json.runs[0].providerId, 'plan');

    const requestEvent = await pollUntil(async () => {
      const tl = await httpGet(`http://localhost:${ports.gateway}/v0/timeline?sessionId=${sessionDataCollection}&cursor=0`);
      const interactions = findInteractionEvents(tl.json);
      return interactions.find((item) => item.event.type === 'provider_extension' && item.event.extensionKind === 'data_collection_request') || null;
    });
    assert.ok(requestEvent.event.payload?.dataSchema);
    assert.ok(requestEvent.event.payload?.uiSchema);

    const interact = await httpPost(`http://localhost:${ports.gateway}/v0/interact`, {
      schemaVersion: 'v0',
      traceId: randomUUID(),
      sessionId: sessionDataCollection,
      userId: 'u-conformance',
      providerId: 'plan',
      runId,
      actionId: 'submit_data_collection',
      payload: {
        goal: '通过 conformance',
        dueDate: '2026-03-01',
      },
      timestampMs: nowMs(),
    });
    assert.equal(interact.status, 200);
    assert.equal(interact.json.accepted, true);

    await pollUntil(async () => {
      const tl = await httpGet(`http://localhost:${ports.gateway}/v0/timeline?sessionId=${sessionDataCollection}&cursor=0`);
      const interactions = findInteractionEvents(tl.json);
      const extKinds = interactions
        .filter((item) => item.event.type === 'provider_extension')
        .map((item) => item.event.extensionKind);
      return extKinds.includes('data_collection_progress') && extKinds.includes('data_collection_result');
    });

    // 3) profileRef 拉取
    const contextOk = await httpGet(
      `http://localhost:${ports.gateway}/v0/context/users/profile:u-conformance`,
      {
        authorization: 'Bearer provider-dev-token',
        'x-provider-scopes': 'context:read',
      },
    );
    assert.equal(contextOk.status, 200);
    assert.ok(contextOk.json.profile);
    assert.ok(contextOk.json.preferences);
    assert.ok(contextOk.json.consents);

    const contextForbidden = await httpGet(
      `http://localhost:${ports.gateway}/v0/context/users/profile:u-conformance`,
      {
        authorization: 'Bearer provider-dev-token',
      },
    );
    assert.equal(contextForbidden.status, 403);

    // 4) 会话分割：闲置 24h + 主题漂移提示
    const sessionIdle = 's-conf-idle';
    const oldTs = nowMs() - 2 * 24 * 60 * 60 * 1000;
    const firstIdle = await httpPost(
      `http://localhost:${ports.gateway}/v0/ingest`,
      buildInput({ sessionId: sessionIdle, text: '第一次会话', timestampMs: oldTs }),
    );
    assert.equal(firstIdle.status, 200);

    const secondIdle = await httpPost(
      `http://localhost:${ports.gateway}/v0/ingest`,
      buildInput({ sessionId: sessionIdle, text: '第二次会话，应该切分', timestampMs: nowMs() }),
    );
    assert.equal(secondIdle.status, 200);
    assert.notEqual(secondIdle.json.sessionId, sessionIdle);

    const sessionDrift = 's-conf-drift';
    await httpPost(
      `http://localhost:${ports.gateway}/v0/ingest`,
      buildInput({ sessionId: sessionDrift, text: '苹果 香蕉 橙子 葡萄' }),
    );
    await httpPost(
      `http://localhost:${ports.gateway}/v0/ingest`,
      buildInput({ sessionId: sessionDrift, text: '工作 汇报 会议 项目' }),
    );
    await httpPost(
      `http://localhost:${ports.gateway}/v0/ingest`,
      buildInput({ sessionId: sessionDrift, text: '体检 饮食 睡眠 提醒' }),
    );

    const driftTimeline = await httpGet(
      `http://localhost:${ports.gateway}/v0/timeline?sessionId=${sessionDrift}&cursor=0`,
    );
    const driftInteractions = findInteractionEvents(driftTimeline.json);
    const driftCard = driftInteractions.find(
      (item) => item.event.type === 'card' && (item.event.title || '').includes('话题变化'),
    );
    assert.ok(driftCard);
    assert.ok((driftCard.event.actions || []).some((action) => action.actionId === 'new_session:auto'));

    // 5) sticky + 手动切换
    const sessionSticky = 's-conf-sticky';
    await httpPost(
      `http://localhost:${ports.gateway}/v0/ingest`,
      buildInput({ sessionId: sessionSticky, text: '帮我做个学习计划' }),
    );
    await httpPost(
      `http://localhost:${ports.gateway}/v0/ingest`,
      buildInput({ sessionId: sessionSticky, text: '今天工作汇报和项目交付要推进' }),
    );
    await httpPost(
      `http://localhost:${ports.gateway}/v0/ingest`,
      buildInput({ sessionId: sessionSticky, text: '这个任务和会议需要持续跟进' }),
    );

    const switchHint = await pollUntil(async () => {
      const tl = await httpGet(`http://localhost:${ports.gateway}/v0/timeline?sessionId=${sessionSticky}&cursor=0`);
      const interactions = findInteractionEvents(tl.json);
      return interactions.find(
        (item) =>
          item.event.type === 'card' &&
          (item.event.actions || []).some((action) => String(action.actionId).startsWith('switch_provider:')),
      ) || null;
    });

    const switchAction = switchHint.event.actions.find((action) =>
      String(action.actionId).startsWith('switch_provider:'),
    );
    assert.ok(switchAction);

    const switchRes = await httpPost(`http://localhost:${ports.gateway}/v0/interact`, {
      schemaVersion: 'v0',
      traceId: randomUUID(),
      sessionId: sessionSticky,
      userId: 'u-conformance',
      providerId: 'work',
      runId: randomUUID(),
      actionId: switchAction.actionId,
      timestampMs: nowMs(),
    });
    assert.equal(switchRes.status, 200);
    assert.equal(switchRes.json.accepted, true);

    const switchedMessage = await pollUntil(async () => {
      const tl = await httpGet(`http://localhost:${ports.gateway}/v0/timeline?sessionId=${sessionSticky}&cursor=0`);
      const interactions = findInteractionEvents(tl.json);
      return interactions.find(
        (item) => item.event.type === 'assistant_message' && String(item.event.text || '').includes('已切换到 work 专项'),
      ) || null;
    });
    assert.ok(switchedMessage);

    // 微信 adapter 基础闭环
    const wechat = await httpPost(`http://localhost:${ports.adapter}/wechat/webhook`, {
      openid: 'wx-conformance',
      text: '安排一下今天工作',
    });
    assert.equal(wechat.status, 200);
    assert.equal(wechat.json.ok, true);

    console.log('\n[conformance] PASS');
  } finally {
    stopAll();
    await sleep(500);
  }
}

run().catch((error) => {
  console.error('\n[conformance] FAIL');
  console.error(error);
  process.exit(1);
});
