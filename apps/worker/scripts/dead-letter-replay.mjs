#!/usr/bin/env node
import process from 'node:process';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';

function parseBooleanFlag(value, fallback) {
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseArgs(argv) {
  const args = {
    databaseUrl: process.env.DATABASE_URL || '',
    eventId: undefined,
    sessionId: undefined,
    limit: Number(process.env.REPLAY_LIMIT || 20),
    all: false,
    dryRun: false,
    replayToken: process.env.REPLAY_TOKEN || `replay-${randomUUID().slice(0, 8)}`,
    note: process.env.REPLAY_NOTE || '',
    resetAttempts: parseBooleanFlag(process.env.REPLAY_RESET_ATTEMPTS, true),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const hasInlineValue = arg.includes('=');
    const [flag, inlineValue] = hasInlineValue ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    const nextValue = () => (hasInlineValue ? inlineValue : (argv[++i] || undefined));

    switch (flag) {
      case '--':
        break;
      case '--database-url':
        args.databaseUrl = nextValue() || '';
        break;
      case '--event-id':
        args.eventId = nextValue();
        break;
      case '--session-id':
        args.sessionId = nextValue();
        break;
      case '--limit':
        args.limit = Number(nextValue());
        break;
      case '--replay-token':
        args.replayToken = nextValue() || args.replayToken;
        break;
      case '--note':
        args.note = nextValue() || '';
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--all':
        args.all = true;
        break;
      case '--no-reset-attempts':
        args.resetAttempts = false;
        break;
      case '--help':
        printUsage();
        process.exit(0);
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!args.databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  if (!args.all && !args.eventId && !args.sessionId) {
    throw new Error('must provide --event-id or --session-id, or use --all');
  }

  if (!Number.isFinite(args.limit) || args.limit <= 0) {
    args.limit = 20;
  } else {
    args.limit = Math.floor(args.limit);
  }

  return args;
}

function printUsage() {
  console.log(`
Usage:
  node apps/worker/scripts/dead-letter-replay.mjs [options]

Options:
  --event-id <id>          replay one dead-letter event
  --session-id <id>        replay dead-letter events for one session
  --all                    allow global replay query (must still respect --limit)
  --limit <n>              max rows to replay (default 20)
  --replay-token <token>   idempotency token (default auto-generated)
  --note <text>            optional operator note
  --dry-run                only list candidate rows, do not update
  --no-reset-attempts      keep attempts near terminal threshold
  --database-url <url>     override DATABASE_URL
  --help                   show usage
  `);
}

function buildWhere({ eventId, sessionId }) {
  const clauses = [`status = 'dead_letter'`];
  const params = [];

  if (eventId) {
    params.push(eventId);
    clauses.push(`event_id = $${params.length}`);
  }
  if (sessionId) {
    params.push(sessionId);
    clauses.push(`session_id = $${params.length}`);
  }

  return {
    whereSql: clauses.join(' AND '),
    params,
  };
}

async function ensureReplayLogTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS outbox_replay_log (
      id BIGSERIAL PRIMARY KEY,
      replay_token TEXT NOT NULL,
      event_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      previous_status TEXT NOT NULL,
      previous_attempts INT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (replay_token, event_id)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_outbox_replay_log_created_at
      ON outbox_replay_log(created_at DESC)
  `);
}

function summarizeRows(rows) {
  return rows.map((row) => ({
    eventId: String(row.event_id),
    sessionId: String(row.session_id),
    status: String(row.status),
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 0),
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = new Pool({ connectionString: args.databaseUrl });

  try {
    const { whereSql, params } = buildWhere(args);
    const selectSql = `
      SELECT id, event_id, session_id, status, attempts, max_attempts
      FROM outbox_events
      WHERE ${whereSql}
      ORDER BY created_at ASC
      LIMIT $${params.length + 1}
      FOR UPDATE SKIP LOCKED
    `;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureReplayLogTable(client);

      const selected = await client.query(selectSql, [...params, args.limit]);
      const candidates = summarizeRows(selected.rows);

      if (args.dryRun) {
        await client.query('ROLLBACK');
        console.log('[replay][DRY-RUN]', {
          replayToken: args.replayToken,
          selected: candidates.length,
          candidates,
        });
        return;
      }

      if (candidates.length === 0) {
        await client.query('COMMIT');
        console.log('[replay][PASS]', {
          replayToken: args.replayToken,
          selected: 0,
          inserted: 0,
          updated: 0,
        });
        return;
      }

      const eventIds = candidates.map((row) => row.eventId);
      const inserted = await client.query(`
        INSERT INTO outbox_replay_log (
          replay_token,
          event_id,
          session_id,
          previous_status,
          previous_attempts,
          note
        )
        SELECT
          $1,
          event_id,
          session_id,
          status,
          attempts,
          $2
        FROM outbox_events
        WHERE event_id = ANY($3::text[])
          AND status = 'dead_letter'
        ON CONFLICT (replay_token, event_id) DO NOTHING
        RETURNING event_id
      `, [args.replayToken, args.note || null, eventIds]);

      const idempotentEventIds = inserted.rows.map((row) => String(row.event_id));
      let updatedRows = [];

      if (idempotentEventIds.length > 0) {
        const updated = await client.query(`
          UPDATE outbox_events
          SET status = 'failed',
              attempts = CASE
                WHEN $2::BOOLEAN = TRUE THEN 0
                ELSE LEAST(attempts, GREATEST(max_attempts - 1, 0))
              END,
              next_retry_at = NOW(),
              last_error = NULL,
              locked_by = NULL,
              locked_at = NULL,
              updated_at = NOW()
          WHERE event_id = ANY($1::text[])
            AND status = 'dead_letter'
          RETURNING event_id, session_id, status, attempts, max_attempts
        `, [idempotentEventIds, args.resetAttempts]);
        updatedRows = summarizeRows(updated.rows);
      }

      await client.query('COMMIT');
      console.log('[replay][PASS]', {
        replayToken: args.replayToken,
        selected: candidates.length,
        inserted: idempotentEventIds.length,
        updated: updatedRows.length,
        updatedRows,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[replay][FAIL]', String(error));
  process.exit(1);
});
