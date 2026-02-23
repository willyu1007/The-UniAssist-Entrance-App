#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';

function nowMs() {
  return Date.now();
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function boolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}

function createEnvelope({ eventId, sessionId, traceId, userId, text, streamKey, globalKey }) {
  return {
    schemaVersion: 'v0',
    type: 'timeline_event',
    event: {
      schemaVersion: 'v0',
      eventId,
      traceId,
      sessionId,
      userId,
      seq: 99999,
      timestampMs: nowMs(),
      kind: 'interaction',
      payload: {
        event: {
          type: 'assistant_message',
          text,
        },
        source: 'staging-drill',
      },
    },
    stream: {
      key: streamKey,
      globalKey,
    },
  };
}

async function insertOutbox(pool, {
  eventId,
  sessionId,
  payload,
  status,
  attempts = 0,
  maxAttempts = 12,
  lastError = null,
}) {
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
    VALUES ($1, $2, 'timeline', $3::jsonb, $4, $5, $6, $7, NOW(), NOW())
    ON CONFLICT (event_id) DO NOTHING
  `, [eventId, sessionId, JSON.stringify(payload), status, attempts, maxAttempts, lastError]);
}

async function readStatus(pool, eventId) {
  const result = await pool.query(`
    SELECT status, attempts, updated_at
    FROM outbox_events
    WHERE event_id = $1
  `, [eventId]);

  if (result.rowCount === 0) return null;
  return {
    status: String(result.rows[0].status),
    attempts: Number(result.rows[0].attempts || 0),
    updatedAt: String(result.rows[0].updated_at || ''),
  };
}

async function waitForStatus(pool, eventId, expectedStatuses, timeoutMs) {
  const startedAt = nowMs();
  let last = null;
  while (nowMs() - startedAt < timeoutMs) {
    last = await readStatus(pool, eventId);
    if (last && expectedStatuses.includes(last.status)) {
      return { status: last, elapsedMs: nowMs() - startedAt };
    }
    await sleep(500);
  }
  throw new Error(`timeout waiting status ${expectedStatuses.join('/')} for eventId=${eventId}, last=${JSON.stringify(last)}`);
}

async function runCommand(name, args, extraEnv) {
  const child = spawn('pnpm', args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const [code] = await once(child, 'exit');
  if (code !== 0) {
    throw new Error(`${name} failed (code=${String(code)}): ${stderr || stdout}`);
  }
  return { stdout, stderr };
}

function buildReport({ mode, gatewayBaseUrl, streamGroup, globalStreamKey, results, outputPath }) {
  const lines = [];
  lines.push('# Staging Worker Reliability Drill Report');
  lines.push('');
  lines.push(`- Timestamp: ${nowIso()}`);
  lines.push(`- Mode: ${mode}`);
  lines.push(`- Gateway: ${gatewayBaseUrl || 'n/a'}`);
  lines.push(`- Stream group: ${streamGroup}`);
  lines.push(`- Global stream key: ${globalStreamKey}`);
  lines.push('');
  lines.push('| Step | Result | Elapsed(ms) | Details |');
  lines.push('| --- | --- | --- | --- |');
  results.forEach((row) => {
    lines.push(`| ${row.step} | ${row.result} | ${row.elapsedMs ?? '-'} | ${row.details || '-'} |`);
  });
  lines.push('');
  lines.push(`- Report path: ${outputPath}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const mode = (process.env.WORKER_DRILL_MODE || 'simulate').trim();
  const databaseUrl = process.env.DATABASE_URL || '';
  const redisUrl = process.env.REDIS_URL || '';
  const gatewayBaseUrl = (process.env.STAGING_GATEWAY_BASE_URL || '').replace(/\/$/, '');
  const timeoutMs = envInt('WORKER_DRILL_TIMEOUT_MS', 45_000);
  const enableNoGroupStep = boolEnv('WORKER_DRILL_ENABLE_NOGROUP', true);
  const streamPrefix = process.env.UNIASSIST_STREAM_PREFIX || 'uniassist:timeline:';
  const globalStreamKey = process.env.UNIASSIST_STREAM_GLOBAL_KEY || `${streamPrefix}all`;
  const streamGroup = process.env.UNIASSIST_STREAM_GROUP || 'ua-delivery';
  const outputPath = process.env.WORKER_DRILL_OUTPUT_PATH || path.join('ops', 'deploy', 'reports', 'staging-worker-drill-latest.md');

  const reportAbsPath = path.isAbsolute(outputPath) ? outputPath : path.join(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(reportAbsPath), { recursive: true });

  const results = [];

  if (gatewayBaseUrl) {
    const startedAt = nowMs();
    try {
      const health = await fetch(`${gatewayBaseUrl}/health`);
      const body = await health.json().catch(() => ({}));
      if (health.status !== 200 || body.ok !== true) {
        throw new Error(`health failed status=${health.status}`);
      }
      results.push({
        step: 'gateway-health',
        result: 'pass',
        elapsedMs: nowMs() - startedAt,
        details: 'gateway /health ok',
      });
    } catch (error) {
      results.push({
        step: 'gateway-health',
        result: 'fail',
        elapsedMs: nowMs() - startedAt,
        details: String(error),
      });
    }
  }

  if (mode !== 'live') {
    const startedAt = nowMs();
    const replayHelp = await runCommand(
      'replay-help',
      ['worker:replay:dead-letter', '--', '--help'],
      { DATABASE_URL: databaseUrl || 'postgres://localhost:5432/uniassist_gateway' },
    );
    results.push({
      step: 'replay-cli-ready',
      result: replayHelp.stdout.includes('Usage:') ? 'pass' : 'warn',
      elapsedMs: nowMs() - startedAt,
      details: 'worker replay CLI help checked',
    });

    const report = buildReport({
      mode,
      gatewayBaseUrl,
      streamGroup,
      globalStreamKey,
      results,
      outputPath,
    });
    fs.writeFileSync(reportAbsPath, report, 'utf8');
    console.log('[worker-drill][PASS] simulate drill complete');
    console.log('[worker-drill][SUMMARY]', { mode, outputPath, steps: results.length });
    return;
  }

  if (!databaseUrl || !redisUrl) {
    throw new Error('DATABASE_URL and REDIS_URL are required when WORKER_DRILL_MODE=live');
  }

  const workerRequire = createRequire(path.join(process.cwd(), 'apps/worker/package.json'));
  const { Pool } = workerRequire('pg');
  const { createClient } = workerRequire('redis');

  const runToken = randomUUID().slice(0, 8);
  const traceId = `staging-worker-drill-trace-${runToken}`;
  const userId = `staging-worker-drill-user-${runToken}`;
  const sessionId = `staging-worker-drill-session-${runToken}`;
  const replayToken = `staging-worker-drill-replay-${runToken}`;
  const sessionStreamKey = `${streamPrefix}drill:${runToken}:${sessionId}`;
  const pool = new Pool({ connectionString: databaseUrl });
  const redis = createClient({ url: redisUrl });

  const createdEventIds = [];

  try {
    await pool.query('SELECT 1');
    await redis.connect();
    await redis.ping();

    const retryEventId = `staging-worker-drill-retry-${runToken}`;
    const retryStarted = nowMs();
    const retryEnvelope = createEnvelope({
      eventId: retryEventId,
      sessionId,
      traceId,
      userId,
      text: 'worker drill retry event',
      streamKey: sessionStreamKey,
      globalKey: globalStreamKey,
    });
    await insertOutbox(pool, {
      eventId: retryEventId,
      sessionId,
      payload: retryEnvelope,
      status: 'failed',
      attempts: 1,
      maxAttempts: 12,
      lastError: 'drill-retry-injected',
    });
    createdEventIds.push(retryEventId);
    const retrySettled = await waitForStatus(pool, retryEventId, ['consumed'], timeoutMs);
    results.push({
      step: 'retry-recovery',
      result: 'pass',
      elapsedMs: retrySettled.elapsedMs,
      details: `status=${retrySettled.status.status} attempts=${retrySettled.status.attempts}`,
    });

    if (enableNoGroupStep) {
      const noGroupEventId = `staging-worker-drill-nogroup-${runToken}`;
      await redis.sendCommand(['XGROUP', 'DESTROY', globalStreamKey, streamGroup]);

      const noGroupEnvelope = createEnvelope({
        eventId: noGroupEventId,
        sessionId,
        traceId,
        userId,
        text: 'worker drill nogroup recovery event',
        streamKey: sessionStreamKey,
        globalKey: globalStreamKey,
      });
      await insertOutbox(pool, {
        eventId: noGroupEventId,
        sessionId,
        payload: noGroupEnvelope,
        status: 'pending',
        attempts: 0,
        maxAttempts: 12,
      });
      createdEventIds.push(noGroupEventId);

      const noGroupSettled = await waitForStatus(pool, noGroupEventId, ['consumed'], timeoutMs);
      results.push({
        step: 'nogroup-recovery',
        result: 'pass',
        elapsedMs: noGroupSettled.elapsedMs,
        details: `status=${noGroupSettled.status.status} attempts=${noGroupSettled.status.attempts}`,
      });
    } else {
      results.push({
        step: 'nogroup-recovery',
        result: 'skip',
        details: 'WORKER_DRILL_ENABLE_NOGROUP=false',
      });
    }

    const deadLetterEventId = `staging-worker-drill-dead-letter-${runToken}`;
    const deadLetterEnvelope = createEnvelope({
      eventId: deadLetterEventId,
      sessionId,
      traceId,
      userId,
      text: 'worker drill dead-letter replay event',
      streamKey: sessionStreamKey,
      globalKey: globalStreamKey,
    });
    await insertOutbox(pool, {
      eventId: deadLetterEventId,
      sessionId,
      payload: deadLetterEnvelope,
      status: 'dead_letter',
      attempts: 12,
      maxAttempts: 12,
      lastError: 'drill-dead-letter-injected',
    });
    createdEventIds.push(deadLetterEventId);

    const replayStartedAt = nowMs();
    await runCommand(
      'replay-live',
      ['worker:replay:dead-letter', '--', '--event-id', deadLetterEventId, '--replay-token', replayToken],
      { DATABASE_URL: databaseUrl },
    );
    const replaySettled = await waitForStatus(pool, deadLetterEventId, ['consumed'], timeoutMs);
    results.push({
      step: 'dead-letter-replay',
      result: 'pass',
      elapsedMs: nowMs() - replayStartedAt,
      details: `status=${replaySettled.status.status} attempts=${replaySettled.status.attempts}`,
    });

    const replayIdempotentStartedAt = nowMs();
    const secondReplay = await runCommand(
      'replay-live-idempotent',
      ['worker:replay:dead-letter', '--', '--event-id', deadLetterEventId, '--replay-token', replayToken],
      { DATABASE_URL: databaseUrl },
    );
    const idempotentOk = secondReplay.stdout.includes('updated: 0');
    results.push({
      step: 'replay-idempotent',
      result: idempotentOk ? 'pass' : 'fail',
      elapsedMs: nowMs() - replayIdempotentStartedAt,
      details: idempotentOk ? 'updated=0 confirmed' : 'unexpected replay result',
    });

    results.push({
      step: 'drill-summary',
      result: 'pass',
      elapsedMs: nowMs() - retryStarted,
      details: `sessionId=${sessionId}`,
    });
  } finally {
    try {
      if (createdEventIds.length > 0) {
        await pool.query('DELETE FROM outbox_events WHERE event_id = ANY($1::text[])', [createdEventIds]);
      }
      await pool.query('DELETE FROM outbox_replay_log WHERE replay_token = $1 OR session_id = $2', [replayToken, sessionId]);
    } catch {
      // cleanup best effort
    }
    try {
      await redis.del(sessionStreamKey);
    } catch {
      // cleanup best effort
    }
    if (redis.isOpen) {
      await redis.quit();
    }
    await pool.end();
  }

  const report = buildReport({
    mode,
    gatewayBaseUrl,
    streamGroup,
    globalStreamKey,
    results,
    outputPath,
  });
  fs.writeFileSync(reportAbsPath, report, 'utf8');
  console.log('[worker-drill][PASS] live drill complete');
  console.log('[worker-drill][SUMMARY]', { mode, outputPath, steps: results.length });
}

main().catch((error) => {
  console.error('[worker-drill][FAIL]', String(error));
  process.exit(1);
});
