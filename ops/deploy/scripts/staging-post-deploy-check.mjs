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
  return { status: res.status, json };
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
  return { status: res.status, json };
}

async function waitFor(label, fn, timeoutMs, intervalMs = 500) {
  const start = nowMs();
  while (nowMs() - start < timeoutMs) {
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

async function main() {
  const gatewayBase = requiredEnv('STAGING_GATEWAY_BASE_URL');
  const providerBase = optionalEnv('STAGING_PROVIDER_PLAN_BASE_URL');
  const adapterBase = optionalEnv('STAGING_ADAPTER_WECHAT_BASE_URL');
  const contextToken = process.env.STAGING_CONTEXT_TOKEN || '';
  const timeoutMs = toInt(process.env.STAGING_VERIFY_TIMEOUT_MS, 30_000);

  const health = {
    gateway: await assertHealth(gatewayBase, 'gateway'),
  };

  if (providerBase) {
    health.providerPlan = await assertHealth(providerBase, 'provider-plan');
  }
  if (adapterBase) {
    health.adapterWechat = await assertHealth(adapterBase, 'adapter-wechat');
  }

  const sessionId = `staging-check-${randomUUID().slice(0, 8)}`;
  const traceId = `staging-trace-${randomUUID().slice(0, 8)}`;
  const userId = `staging-user-${randomUUID().slice(0, 8)}`;

  const ingest = await postJson(`${gatewayBase}/v0/ingest`, {
    schemaVersion: 'v0',
    traceId,
    userId,
    sessionId,
    source: 'app',
    text: '请给我一个今天的工作安排建议',
    timestampMs: nowMs(),
  });
  assert.equal(ingest.status, 200, `ingest failed with status ${ingest.status}`);

  const timeline = await waitFor(
    'timeline core events',
    async () => {
      const tl = await getJson(`${gatewayBase}/v0/timeline?sessionId=${encodeURIComponent(sessionId)}&cursor=0`);
      if (tl.status !== 200) return null;
      const events = Array.isArray(tl.json?.events) ? tl.json.events : [];
      const kinds = new Set(events.map((event) => event.kind));
      if (kinds.has('routing_decision') && kinds.has('provider_run') && kinds.has('interaction')) {
        return { count: events.length, kinds: [...kinds] };
      }
      return null;
    },
    timeoutMs,
  );

  let contextCheck = 'skipped';
  if (contextToken) {
    const context = await getJson(`${gatewayBase}/v0/context/users/profile:${encodeURIComponent(userId)}`, {
      authorization: `Bearer ${contextToken}`,
      'x-provider-scopes': 'context:read',
    });
    assert.equal(context.status, 200, `context read failed with status ${context.status}`);
    contextCheck = 'ok';
  }

  console.log('[staging-verify][PASS] post-deploy checks passed');
  console.log('[staging-verify][SUMMARY]', {
    gatewayBase,
    providerBase: providerBase || '(skipped)',
    adapterBase: adapterBase || '(skipped)',
    health,
    ingest: {
      sessionId,
      traceId,
      runs: ingest.json?.runs?.length ?? 0,
    },
    timeline,
    contextCheck,
  });
}

main().catch((error) => {
  console.error('[staging-verify][FAIL]', error);
  process.exit(1);
});
