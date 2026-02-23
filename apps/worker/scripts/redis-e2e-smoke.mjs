import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { createClient } from 'redis';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(workerDir, '../..');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowMs() {
  return Date.now();
}

function envRequired(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function envInt(name, fallback) {
  const raw = process.env[name];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function startService(name, args, env = {}) {
  const child = spawn('pnpm', args, {
    cwd: repoRoot,
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

async function stopService(name, child) {
  if (!child || child.exitCode !== null || child.killed) return;
  child.kill('SIGTERM');
  const timeout = sleep(6_000).then(() => {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
  });
  try {
    await Promise.race([once(child, 'exit'), timeout]);
  } catch {
    // no-op
  }
  if (child.exitCode === null) {
    process.stderr.write(`[${name}] force-killed\n`);
  }
}

async function waitForHealth(name, url, timeoutMs = 30_000) {
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

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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

async function waitFor(label, fn, timeoutMs = 40_000, intervalMs = 400) {
  const start = nowMs();
  let lastValue = null;
  while (nowMs() - start < timeoutMs) {
    lastValue = await fn();
    if (lastValue) return lastValue;
    await sleep(intervalMs);
  }
  throw new Error(`${label} timeout (${timeoutMs}ms)`);
}

function toCounts(row) {
  return {
    total: Number(row.total || 0),
    pending: Number(row.pending || 0),
    processing: Number(row.processing || 0),
    failed: Number(row.failed || 0),
    delivered: Number(row.delivered || 0),
    consumed: Number(row.consumed || 0),
    deadLetter: Number(row.dead_letter || 0),
  };
}

async function readOutboxCounts(pool, sessionId) {
  const result = await pool.query(`
    SELECT
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (WHERE status = 'pending')::INT AS pending,
      COUNT(*) FILTER (WHERE status = 'processing')::INT AS processing,
      COUNT(*) FILTER (WHERE status = 'failed')::INT AS failed,
      COUNT(*) FILTER (WHERE status = 'delivered')::INT AS delivered,
      COUNT(*) FILTER (WHERE status = 'consumed')::INT AS consumed,
      COUNT(*) FILTER (WHERE status = 'dead_letter')::INT AS dead_letter
    FROM outbox_events
    WHERE session_id = $1
  `, [sessionId]);
  return toCounts(result.rows[0] || {});
}

async function readOutboxStatus(pool, eventId) {
  const result = await pool.query(`
    SELECT status, attempts
    FROM outbox_events
    WHERE event_id = $1
  `, [eventId]);
  if (result.rowCount === 0) return null;
  return {
    status: String(result.rows[0].status),
    attempts: Number(result.rows[0].attempts || 0),
  };
}

function buildIngest({ sessionId, traceId, userId }) {
  return {
    schemaVersion: 'v0',
    traceId,
    userId,
    sessionId,
    source: 'app',
    text: '请帮我做本周计划并安排今天待办',
    timestampMs: nowMs(),
  };
}

async function main() {
  const databaseUrl = envRequired('DATABASE_URL');
  const redisUrl = envRequired('REDIS_URL');

  const runToken = randomUUID().slice(0, 8);
  const userId = `u-smoke-${runToken}`;
  const sessionId = `s-smoke-${runToken}`;
  const traceId = `t-smoke-${runToken}`;
  const retryEventId = `e-smoke-retry-${runToken}`;

  const gatewayPort = envInt('SMOKE_GATEWAY_PORT', 18877);
  const providerPort = envInt('SMOKE_PROVIDER_PORT', 18890);
  const timeoutMs = envInt('SMOKE_TIMEOUT_MS', 40_000);
  const keepArtifacts = process.env.SMOKE_KEEP_ARTIFACTS === 'true';

  const streamPrefix = process.env.SMOKE_STREAM_PREFIX || `uniassist:timeline:smoke:${runToken}:`;
  const globalStreamKey = process.env.SMOKE_STREAM_GLOBAL_KEY || `${streamPrefix}all`;
  const streamGroup = process.env.SMOKE_STREAM_GROUP || `ua-delivery-smoke-${runToken}`;
  const sessionStreamKey = `${streamPrefix}${sessionId}`;

  const pool = new Pool({ connectionString: databaseUrl });
  const redis = createClient({ url: redisUrl });
  redis.on('error', (error) => {
    process.stderr.write(`[smoke][redis] ${String(error)}\n`);
  });

  const provider = startService('provider-plan', ['--filter', '@baseinterface/provider-plan', 'start'], {
    PORT: String(providerPort),
  });
  const gateway = startService('gateway', ['--filter', '@baseinterface/gateway', 'start'], {
    PORT: String(gatewayPort),
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    UNIASSIST_STREAM_PREFIX: streamPrefix,
    UNIASSIST_STREAM_GLOBAL_KEY: globalStreamKey,
    UNIASSIST_OUTBOX_INLINE_DISPATCH: 'false',
    UNIASSIST_PLAN_PROVIDER_BASE_URL: `http://localhost:${providerPort}`,
  });
  const worker = startService('worker', ['--filter', '@baseinterface/worker', 'start'], {
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    UNIASSIST_STREAM_PREFIX: streamPrefix,
    UNIASSIST_STREAM_GLOBAL_KEY: globalStreamKey,
    UNIASSIST_STREAM_GROUP: streamGroup,
    UNIASSIST_STREAM_CONSUMER: `smoke-${runToken}`,
    OUTBOX_POLL_MS: '300',
    STREAM_CONSUMER_BLOCK_MS: '600',
  });

  const stopAll = async () => {
    await stopService('worker', worker);
    await stopService('gateway', gateway);
    await stopService('provider-plan', provider);
  };

  process.on('SIGINT', async () => {
    await stopAll();
    process.exit(130);
  });
  process.on('SIGTERM', async () => {
    await stopAll();
    process.exit(143);
  });

  try {
    await pool.query('SELECT 1');
    await redis.connect();
    await redis.ping();

    await waitForHealth('provider-plan', `http://localhost:${providerPort}/health`, timeoutMs);
    await waitForHealth('gateway', `http://localhost:${gatewayPort}/health`, timeoutMs);

    const ingest = await postJson(`http://localhost:${gatewayPort}/v0/ingest`, buildIngest({ sessionId, traceId, userId }));
    assert.equal(ingest.status, 200, `ingest expected 200, got ${ingest.status}`);

    const baseline = await waitFor(
      'baseline outbox rows',
      async () => {
        const counts = await readOutboxCounts(pool, sessionId);
        return counts.total > 0 ? counts : null;
      },
      timeoutMs,
    );

    await waitFor(
      'baseline outbox consumed',
      async () => {
        const counts = await readOutboxCounts(pool, sessionId);
        if (counts.deadLetter > 0) {
          throw new Error(`dead_letter rows detected: ${JSON.stringify(counts)}`);
        }
        const settled = counts.total > 0 && counts.pending === 0 && counts.processing === 0 && counts.failed === 0 && counts.delivered === 0;
        return settled ? counts : null;
      },
      timeoutMs,
    );

    const retryEnvelope = {
      schemaVersion: 'v0',
      type: 'timeline_event',
      event: {
        schemaVersion: 'v0',
        eventId: retryEventId,
        traceId,
        sessionId,
        userId,
        seq: 99999,
        timestampMs: nowMs(),
        kind: 'interaction',
        payload: {
          event: {
            type: 'assistant_message',
            text: 'retry smoke injected',
          },
          source: 'smoke',
        },
      },
      stream: {
        key: sessionStreamKey,
        globalKey: globalStreamKey,
      },
    };

    await pool.query(`
      INSERT INTO outbox_events (
        event_id,
        session_id,
        channel,
        payload,
        status,
        attempts,
        max_attempts,
        last_error,
        next_retry_at,
        updated_at
      )
      VALUES ($1, $2, 'timeline', $3::jsonb, 'failed', 1, 12, 'injected-smoke', NOW(), NOW())
      ON CONFLICT (event_id) DO NOTHING
    `, [retryEventId, sessionId, JSON.stringify(retryEnvelope)]);

    const retryRow = await waitFor(
      'retry row consumed',
      async () => {
        const row = await readOutboxStatus(pool, retryEventId);
        if (!row) return null;
        if (row.status === 'dead_letter') {
          throw new Error(`retry row moved to dead_letter: ${JSON.stringify(row)}`);
        }
        return row.status === 'consumed' ? row : null;
      },
      timeoutMs,
    );

    const sessionLen = Number(await redis.sendCommand(['XLEN', sessionStreamKey]));
    const globalLen = Number(await redis.sendCommand(['XLEN', globalStreamKey]));
    assert.ok(sessionLen > 0, 'session stream should have entries');
    assert.ok(globalLen > 0, 'global stream should have entries');

    console.log('[smoke][PASS] Redis worker pipeline is healthy');
    console.log('[smoke][summary]', {
      sessionId,
      traceId,
      streamPrefix,
      baseline,
      retryRow,
      streamEntries: {
        sessionLen,
        globalLen,
      },
    });
  } finally {
    if (keepArtifacts !== true) {
      try {
        await pool.query('DELETE FROM outbox_events WHERE session_id = $1', [sessionId]);
        await pool.query('DELETE FROM provider_runs WHERE session_id = $1', [sessionId]);
        await pool.query('DELETE FROM timeline_events WHERE session_id = $1', [sessionId]);
        await pool.query('DELETE FROM sessions WHERE session_id = $1', [sessionId]);
      } catch (error) {
        process.stderr.write(`[smoke][cleanup][db] ${String(error)}\n`);
      }

      try {
        await redis.sendCommand(['XGROUP', 'DESTROY', globalStreamKey, streamGroup]);
      } catch {
        // group may not exist, ignore
      }
      try {
        await redis.del(sessionStreamKey, globalStreamKey);
      } catch (error) {
        process.stderr.write(`[smoke][cleanup][redis] ${String(error)}\n`);
      }
    } else {
      console.log('[smoke] artifacts preserved (SMOKE_KEEP_ARTIFACTS=true)');
    }

    await stopAll();
    if (redis.isOpen) {
      await redis.quit();
    }
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[smoke][FAIL]', error);
  process.exit(1);
});
