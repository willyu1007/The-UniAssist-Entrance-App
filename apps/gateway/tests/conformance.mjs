import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ports = {
  provider: 9890,
  gateway: 9877,
  adapter: 9878,
};
const internalAuth = {
  mode: 'enforce',
  issuer: 'uniassist-internal',
  kid: 'kid-main',
  secret: 'internal-secret-main',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowMs() {
  return Date.now();
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
  timestampMs = nowMs(),
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
  const internalEnv = {
    UNIASSIST_INTERNAL_AUTH_MODE: internalAuth.mode,
    UNIASSIST_INTERNAL_AUTH_ISSUER: internalAuth.issuer,
    UNIASSIST_INTERNAL_AUTH_KEYS_JSON: JSON.stringify({ [internalAuth.kid]: internalAuth.secret }),
    UNIASSIST_INTERNAL_AUTH_SIGNING_KID: internalAuth.kid,
  };

  const provider = startService('provider-sample', ['--filter', '@baseinterface/provider-sample', 'start'], {
    PORT: String(ports.provider),
    UNIASSIST_SERVICE_ID: 'provider-sample',
    ...internalEnv,
  });
  const gateway = startService('gateway', ['--filter', '@baseinterface/gateway', 'start'], {
    PORT: String(ports.gateway),
    UNIASSIST_SERVICE_ID: 'gateway',
    UNIASSIST_SAMPLE_PROVIDER_BASE_URL: `http://localhost:${ports.provider}`,
    ...internalEnv,
  });
  const adapter = startService('adapter-wechat', ['--filter', '@baseinterface/adapter-wechat', 'start'], {
    PORT: String(ports.adapter),
    UNIASSIST_SERVICE_ID: 'adapter-wechat',
    GATEWAY_URL: `http://localhost:${ports.gateway}`,
    UNIASSIST_ADAPTER_SECRET: 'dev-adapter-secret',
    ...internalEnv,
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

    // 2) 多 provider 通用任务协议（task_question/task_state）
    const sessionTask = 's-conf-task';
    const sampleIngest = await httpPost(
      `http://localhost:${ports.gateway}/v0/ingest`,
      buildInput({ sessionId: sessionTask, text: '请帮我做一个教学样例评估' }),
    );
    assert.equal(sampleIngest.status, 200);
    const runId = sampleIngest.json.runs[0].runId;
    assert.equal(sampleIngest.json.runs[0].providerId, 'sample');

    const firstQuestion = await pollUntil(async () => {
      const tl = await httpGet(`http://localhost:${ports.gateway}/v0/timeline?sessionId=${sessionTask}&cursor=0`);
      const interactions = findInteractionEvents(tl.json);
      return interactions.find(
        (item) => item.event.type === 'provider_extension' && item.event.extensionKind === 'task_question',
      ) || null;
    });
    const taskId = firstQuestion.event.payload.taskId;
    const firstReplyToken = firstQuestion.event.payload.replyToken;
    assert.ok(taskId);
    assert.ok(firstReplyToken);

    // 带 replyToken 时必须精准命中，providerId/runId 错填也应被网关纠正到目标任务
    const answerGoal = await httpPost(`http://localhost:${ports.gateway}/v0/interact`, {
      schemaVersion: 'v0',
      traceId: randomUUID(),
      sessionId: sessionTask,
      userId: 'u-conformance',
      providerId: 'sample',
      runId: randomUUID(),
      actionId: 'answer_task_question',
      replyToken: firstReplyToken,
      payload: {
        text: 'Alex',
      },
      timestampMs: nowMs(),
    });
    assert.equal(answerGoal.status, 200);
    assert.equal(answerGoal.json.accepted, true);

    const materialsQuestion = await pollUntil(async () => {
      const tl = await httpGet(`http://localhost:${ports.gateway}/v0/timeline?sessionId=${sessionTask}&cursor=0`);
      const interactions = findInteractionEvents(tl.json);
      return interactions.find(
        (item) => (
          item.event.type === 'provider_extension'
          && item.event.extensionKind === 'task_question'
          && item.event.payload?.taskId === taskId
          && String(item.event.payload?.questionId || '').includes('materials')
        ),
      ) || null;
    });
    const secondReplyToken = materialsQuestion.event.payload.replyToken;
    assert.ok(secondReplyToken);

    const answerMaterials = await httpPost(`http://localhost:${ports.gateway}/v0/interact`, {
      schemaVersion: 'v0',
      traceId: randomUUID(),
      sessionId: sessionTask,
      userId: 'u-conformance',
      providerId: 'sample',
      runId,
      actionId: 'answer_task_question',
      replyToken: secondReplyToken,
      payload: {
        materialsSummary: '课堂观察与作业摘要',
      },
      timestampMs: nowMs(),
    });
    assert.equal(answerMaterials.status, 200);
    assert.equal(answerMaterials.json.accepted, true);

    const readyState = await pollUntil(async () => {
      const tl = await httpGet(`http://localhost:${ports.gateway}/v0/timeline?sessionId=${sessionTask}&cursor=0`);
      const interactions = findInteractionEvents(tl.json);
      return interactions.find(
        (item) => (
          item.event.type === 'provider_extension'
          && item.event.extensionKind === 'task_state'
          && item.event.payload?.taskId === taskId
          && item.event.payload?.state === 'ready'
        ),
      ) || null;
    });
    assert.equal(readyState.event.payload.executionPolicy, 'require_user_confirm');

    const execute = await httpPost(`http://localhost:${ports.gateway}/v0/interact`, {
      schemaVersion: 'v0',
      traceId: randomUUID(),
      sessionId: sessionTask,
      userId: 'u-conformance',
      providerId: 'sample',
      runId,
      actionId: `execute_task:${taskId}`,
      timestampMs: nowMs(),
    });
    assert.equal(execute.status, 200);
    assert.equal(execute.json.accepted, true);

    await pollUntil(async () => {
      const tl = await httpGet(`http://localhost:${ports.gateway}/v0/timeline?sessionId=${sessionTask}&cursor=0`);
      const interactions = findInteractionEvents(tl.json);
      const states = interactions
        .filter((item) => item.event.type === 'provider_extension' && item.event.extensionKind === 'task_state')
        .filter((item) => item.event.payload?.taskId === taskId)
        .map((item) => item.event.payload?.state);
      return states.includes('executing') && states.includes('completed');
    });

    // 2.1) 多 pending 任务时必须先澄清，且 replyToken 可精准分发
    const sessionAmbiguous = 's-conf-ambiguous';
    await httpPost(
      `http://localhost:${ports.gateway}/v0/ingest`,
      buildInput({ sessionId: sessionAmbiguous, text: '创建会话基线' }),
    );

    const ambiguousEventsBody = {
      schemaVersion: 'v0',
      providerId: 'sample',
      timestampMs: nowMs(),
      events: [
        {
          kind: 'interaction',
          traceId: randomUUID(),
          sessionId: sessionAmbiguous,
          userId: 'u-conformance',
          runId: 'run-ambiguous-1',
          timestampMs: nowMs(),
          event: {
            type: 'provider_extension',
            extensionKind: 'task_question',
            payload: {
              schemaVersion: 'v0',
              providerId: 'sample',
              runId: 'run-ambiguous-1',
              taskId: 'task:ambiguous:1',
              questionId: 'task:ambiguous:1:goal',
              replyToken: 'reply-ambiguous-1',
              prompt: '请补充任务 1 的目标。',
              answerSchema: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                },
                required: ['text'],
              },
              uiSchema: {
                order: ['text'],
              },
            },
          },
        },
        {
          kind: 'interaction',
          traceId: randomUUID(),
          sessionId: sessionAmbiguous,
          userId: 'u-conformance',
          runId: 'run-ambiguous-2',
          timestampMs: nowMs(),
          event: {
            type: 'provider_extension',
            extensionKind: 'task_question',
            payload: {
              schemaVersion: 'v0',
              providerId: 'sample',
              runId: 'run-ambiguous-2',
              taskId: 'task:ambiguous:2',
              questionId: 'task:ambiguous:2:goal',
              replyToken: 'reply-ambiguous-2',
              prompt: '请补充任务 2 的目标。',
              answerSchema: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                },
                required: ['text'],
              },
              uiSchema: {
                order: ['text'],
              },
            },
          },
        },
      ],
    };
    const ambiguousRaw = JSON.stringify(ambiguousEventsBody);
    const ambiguousInject = await fetch(`http://localhost:${ports.gateway}/v0/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...signInternalHeaders({
          method: 'POST',
          path: '/v0/events',
          rawBody: ambiguousRaw,
          subject: 'provider-sample',
          audience: 'gateway',
          scopes: ['events:write'],
        }),
      },
      body: ambiguousRaw,
    });
    assert.equal(ambiguousInject.status, 200);
    const ambiguousInjectJson = await ambiguousInject.json();
    assert.equal(ambiguousInjectJson.accepted, 2);

    const ambiguousIngest = await httpPost(
      `http://localhost:${ports.gateway}/v0/ingest`,
      buildInput({ sessionId: sessionAmbiguous, text: '这里是回复，但不带 token' }),
    );
    assert.equal(ambiguousIngest.status, 200);
    assert.equal(ambiguousIngest.json.runs.length, 0);
    assert.equal(ambiguousIngest.json.routing.requiresUserConfirmation, true);

    const ambiguousCard = await pollUntil(async () => {
      const tl = await httpGet(`http://localhost:${ports.gateway}/v0/timeline?sessionId=${sessionAmbiguous}&cursor=0`);
      const interactions = findInteractionEvents(tl.json);
      return interactions.find(
        (item) => item.event.type === 'card' && String(item.event.title || '').includes('多个待回复任务'),
      ) || null;
    });
    assert.ok((ambiguousCard.event.actions || []).some((action) => String(action.actionId).startsWith('focus_task:')));

    const targetedReply = await httpPost(`http://localhost:${ports.gateway}/v0/interact`, {
      schemaVersion: 'v0',
      traceId: randomUUID(),
      sessionId: sessionAmbiguous,
      userId: 'u-conformance',
      providerId: 'sample',
      runId: randomUUID(),
      actionId: 'answer_task_question',
      replyToken: 'reply-ambiguous-2',
      payload: {
        text: '聚焦任务 2 的回答',
      },
      timestampMs: nowMs(),
    });
    assert.equal(targetedReply.status, 200);
    assert.equal(targetedReply.json.accepted, true);

    const targetedQuestion = await pollUntil(async () => {
      const tl = await httpGet(`http://localhost:${ports.gateway}/v0/timeline?sessionId=${sessionAmbiguous}&cursor=0`);
      const interactions = findInteractionEvents(tl.json);
      return interactions.find(
        (item) => (
          item.event.type === 'provider_extension'
          && item.event.extensionKind === 'task_question'
          && item.event.payload?.taskId === 'task:ambiguous:2'
          && String(item.event.payload?.questionId || '').includes('materials')
        ),
      ) || null;
    });
    assert.ok(targetedQuestion);

    // 3) profileRef 拉取
    const contextPath = '/v0/context/users/profile:u-conformance';
    const contextOk = await httpGet(`http://localhost:${ports.gateway}${contextPath}`, signInternalHeaders({
      method: 'GET',
      path: contextPath,
      subject: 'provider-sample',
      audience: 'gateway',
      scopes: ['context:read'],
    }));
    assert.equal(contextOk.status, 200);
    assert.ok(contextOk.json.profile);
    assert.ok(contextOk.json.preferences);
    assert.ok(contextOk.json.consents);

    const contextForbidden = await httpGet(`http://localhost:${ports.gateway}${contextPath}`, signInternalHeaders({
      method: 'GET',
      path: contextPath,
      subject: 'provider-sample',
      audience: 'gateway',
      scopes: ['provider:invoke'],
    }));
    assert.equal(contextForbidden.status, 403);
    const contextUnauthorized = await httpGet(`http://localhost:${ports.gateway}${contextPath}`);
    assert.equal(contextUnauthorized.status, 401);

    // 3.1) /v0/events scope
    const eventsBody = {
      schemaVersion: 'v0',
      providerId: 'sample',
      timestampMs: nowMs(),
      events: [
        {
          kind: 'domain_event',
          event: {
            schemaVersion: 'v0',
            userId: 'u-conformance',
            providerId: 'sample',
            eventType: 'progress',
            title: 'conformance event',
            body: 'security scope check',
            timestampMs: nowMs(),
          },
        },
      ],
    };
    const eventsRaw = JSON.stringify(eventsBody);
    const eventsOk = await fetch(`http://localhost:${ports.gateway}/v0/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...signInternalHeaders({
          method: 'POST',
          path: '/v0/events',
          rawBody: eventsRaw,
          subject: 'provider-sample',
          audience: 'gateway',
          scopes: ['events:write'],
        }),
      },
      body: eventsRaw,
    });
    assert.equal(eventsOk.status, 200);
    const eventsOkJson = await eventsOk.json();
    assert.equal(eventsOkJson.accepted, 1);

    const replayNonce = randomUUID();
    const replayTimestamp = nowMs();
    const replayJti = randomUUID();
    const replayHeaders = signInternalHeaders({
      method: 'POST',
      path: '/v0/events',
      rawBody: eventsRaw,
      subject: 'provider-sample',
      audience: 'gateway',
      scopes: ['events:write'],
      nonce: replayNonce,
      timestampMs: replayTimestamp,
      jti: replayJti,
    });
    const replayFirst = await fetch(`http://localhost:${ports.gateway}/v0/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...replayHeaders,
      },
      body: eventsRaw,
    });
    assert.equal(replayFirst.status, 200);
    const replaySecond = await fetch(`http://localhost:${ports.gateway}/v0/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...replayHeaders,
      },
      body: eventsRaw,
    });
    assert.equal(replaySecond.status, 401);

    const eventsForbidden = await fetch(`http://localhost:${ports.gateway}/v0/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...signInternalHeaders({
          method: 'POST',
          path: '/v0/events',
          rawBody: eventsRaw,
          subject: 'provider-sample',
          audience: 'gateway',
          scopes: ['context:read'],
        }),
      },
      body: eventsRaw,
    });
    assert.equal(eventsForbidden.status, 403);
    const eventsUnauthorized = await fetch(`http://localhost:${ports.gateway}/v0/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: eventsRaw,
    });
    assert.equal(eventsUnauthorized.status, 401);

    const contextWrongAudience = await httpGet(`http://localhost:${ports.gateway}${contextPath}`, signInternalHeaders({
      method: 'GET',
      path: contextPath,
      subject: 'provider-sample',
      audience: 'provider-sample',
      scopes: ['context:read'],
    }));
    assert.equal(contextWrongAudience.status, 401);

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
      buildInput({ sessionId: sessionDrift, text: '电影 音乐 阅读 摄影' }),
    );
    await httpPost(
      `http://localhost:${ports.gateway}/v0/ingest`,
      buildInput({ sessionId: sessionDrift, text: '登山 游泳 绘画 厨艺' }),
    );

    const driftCard = await pollUntil(async () => {
      const driftTimeline = await httpGet(
        `http://localhost:${ports.gateway}/v0/timeline?sessionId=${sessionDrift}&cursor=0`,
      );
      const driftInteractions = findInteractionEvents(driftTimeline.json);
      return driftInteractions.find(
        (item) => item.event.type === 'card' && (item.event.title || '').includes('话题变化'),
      ) || null;
    });
    assert.ok(driftCard);
    assert.ok((driftCard.event.actions || []).some((action) => action.actionId === 'new_session:auto'));

    // 5) 手动切换 provider
    const sessionSticky = 's-conf-sticky';
    await httpPost(
      `http://localhost:${ports.gateway}/v0/ingest`,
      buildInput({ sessionId: sessionSticky, text: '帮我做个学习计划' }),
    );

    const switchRes = await httpPost(`http://localhost:${ports.gateway}/v0/interact`, {
      schemaVersion: 'v0',
      traceId: randomUUID(),
      sessionId: sessionSticky,
      userId: 'u-conformance',
      providerId: 'work',
      runId: randomUUID(),
      actionId: 'switch_provider:work',
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
