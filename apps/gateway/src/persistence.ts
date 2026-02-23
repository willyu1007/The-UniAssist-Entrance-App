import { Pool } from 'pg';
import { createClient, type RedisClientType } from 'redis';

import type { TimelineEvent } from '@baseinterface/contracts';

export type StoredSession = {
  sessionId: string;
  userId: string;
  seq: number;
  lastActivityAt: number;
  lastUserText?: string;
  topicDriftStreak: number;
  stickyProviderId?: string;
  stickyScoreBoost: number;
  switchLeadProviderId?: string;
  switchLeadStreak: number;
  lastSwitchTs?: number;
};

export type ProviderRunRecord = {
  runId: string;
  traceId: string;
  sessionId: string;
  userId: string;
  providerId: string;
  mode: 'sync' | 'async';
  routingMode: 'normal' | 'fallback';
  idempotencyKey: string;
  status: string;
};

type UserContextCacheRecord = {
  profileRef: string;
  userId: string;
  snapshot: Record<string, unknown>;
  ttlMs: number;
};

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toMsFromDate(value: unknown): number | undefined {
  if (!value) return undefined;
  const ts = new Date(String(value)).getTime();
  return Number.isFinite(ts) ? ts : undefined;
}

export class GatewayPersistence {
  private readonly pool?: Pool;

  private readonly redis?: RedisClientType;

  private readonly streamPrefix: string;

  private readonly globalStreamKey: string;

  private readonly enableInlineDispatch: boolean;

  private readonly enabled: boolean;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL || '';
    const redisUrl = process.env.REDIS_URL || '';

    if (databaseUrl) {
      this.pool = new Pool({
        connectionString: databaseUrl,
      });
    }

    if (redisUrl) {
      this.redis = createClient({ url: redisUrl });
      this.redis.on('error', (error: unknown) => {
        console.error('[gateway][redis] error', error);
      });
    }

    this.streamPrefix = process.env.UNIASSIST_STREAM_PREFIX || 'uniassist:timeline:';
    this.globalStreamKey = process.env.UNIASSIST_STREAM_GLOBAL_KEY || `${this.streamPrefix}all`;
    this.enableInlineDispatch = process.env.UNIASSIST_OUTBOX_INLINE_DISPATCH === 'true';
    this.enabled = Boolean(this.pool || this.redis);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async init(): Promise<void> {
    if (this.redis && !this.redis.isOpen) {
      await this.redis.connect();
    }

    if (!this.pool) return;

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        seq BIGINT NOT NULL DEFAULT 0,
        last_activity_at TIMESTAMPTZ NOT NULL,
        last_user_text TEXT,
        topic_drift_streak INT NOT NULL DEFAULT 0,
        sticky_provider_id TEXT,
        sticky_weight NUMERIC(5,3) NOT NULL DEFAULT 0.150,
        switch_lead_provider_id TEXT,
        switch_lead_streak INT NOT NULL DEFAULT 0,
        last_switch_ts TIMESTAMPTZ,
        topic_state JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS timeline_events (
        event_id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        provider_id TEXT,
        run_id TEXT,
        seq BIGINT NOT NULL,
        timestamp_ms BIGINT NOT NULL,
        kind TEXT NOT NULL,
        extension_kind TEXT,
        render_schema_ref TEXT,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (session_id, seq)
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS provider_runs (
        run_id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        routing_mode TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS user_context_cache (
        profile_ref TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        snapshot JSONB NOT NULL,
        ttl_expires_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS outbox_events (
        id BIGSERIAL PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'timeline',
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 12,
        last_error TEXT,
        next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        locked_by TEXT,
        locked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        delivered_at TIMESTAMPTZ,
        consumed_at TIMESTAMPTZ,
        consumed_by TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`
      ALTER TABLE outbox_events
      ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 12,
      ADD COLUMN IF NOT EXISTS last_error TEXT,
      ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS locked_by TEXT,
      ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS consumed_by TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_last_activity_at ON sessions(last_activity_at);
      CREATE INDEX IF NOT EXISTS idx_timeline_events_session_seq ON timeline_events(session_id, seq);
      CREATE INDEX IF NOT EXISTS idx_provider_runs_session_id ON provider_runs(session_id);
      CREATE INDEX IF NOT EXISTS idx_outbox_events_status_created_at ON outbox_events(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_outbox_events_status_next_retry ON outbox_events(status, next_retry_at);
      CREATE INDEX IF NOT EXISTS idx_user_context_cache_ttl ON user_context_cache(ttl_expires_at);
    `);
  }

  async close(): Promise<void> {
    if (this.redis && this.redis.isOpen) {
      await this.redis.quit();
    }
    if (this.pool) {
      await this.pool.end();
    }
  }

  async loadSession(sessionId: string): Promise<StoredSession | null> {
    if (!this.pool) return null;

    const result = await this.pool.query(`
      SELECT
        session_id,
        user_id,
        seq,
        last_activity_at,
        last_user_text,
        topic_drift_streak,
        sticky_provider_id,
        sticky_weight,
        switch_lead_provider_id,
        switch_lead_streak,
        last_switch_ts
      FROM sessions
      WHERE session_id = $1
      LIMIT 1
    `, [sessionId]);

    const row = result.rows[0];
    if (!row) return null;

    return {
      sessionId: String(row.session_id),
      userId: String(row.user_id),
      seq: toNumber(row.seq),
      lastActivityAt: new Date(String(row.last_activity_at)).getTime(),
      lastUserText: row.last_user_text ? String(row.last_user_text) : undefined,
      topicDriftStreak: toNumber(row.topic_drift_streak),
      stickyProviderId: row.sticky_provider_id ? String(row.sticky_provider_id) : undefined,
      stickyScoreBoost: toNumber(row.sticky_weight, 0.15),
      switchLeadProviderId: row.switch_lead_provider_id ? String(row.switch_lead_provider_id) : undefined,
      switchLeadStreak: toNumber(row.switch_lead_streak),
      lastSwitchTs: toMsFromDate(row.last_switch_ts),
    };
  }

  async saveSession(session: StoredSession): Promise<void> {
    if (!this.pool) return;

    await this.pool.query(`
      INSERT INTO sessions (
        session_id,
        user_id,
        seq,
        last_activity_at,
        last_user_text,
        topic_drift_streak,
        sticky_provider_id,
        sticky_weight,
        switch_lead_provider_id,
        switch_lead_streak,
        last_switch_ts,
        topic_state,
        updated_at
      ) VALUES (
        $1,
        $2,
        $3,
        to_timestamp($4 / 1000.0),
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        CASE WHEN $11::BIGINT IS NULL THEN NULL ELSE to_timestamp($11 / 1000.0) END,
        $12,
        NOW()
      )
      ON CONFLICT (session_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        seq = EXCLUDED.seq,
        last_activity_at = EXCLUDED.last_activity_at,
        last_user_text = EXCLUDED.last_user_text,
        topic_drift_streak = EXCLUDED.topic_drift_streak,
        sticky_provider_id = EXCLUDED.sticky_provider_id,
        sticky_weight = EXCLUDED.sticky_weight,
        switch_lead_provider_id = EXCLUDED.switch_lead_provider_id,
        switch_lead_streak = EXCLUDED.switch_lead_streak,
        last_switch_ts = EXCLUDED.last_switch_ts,
        topic_state = EXCLUDED.topic_state,
        updated_at = NOW()
    `, [
      session.sessionId,
      session.userId,
      session.seq,
      session.lastActivityAt,
      session.lastUserText || null,
      session.topicDriftStreak,
      session.stickyProviderId || null,
      session.stickyScoreBoost,
      session.switchLeadProviderId || null,
      session.switchLeadStreak,
      session.lastSwitchTs || null,
      JSON.stringify({
        topicDriftStreak: session.topicDriftStreak,
      }),
    ]);
  }

  async saveProviderRun(run: ProviderRunRecord): Promise<void> {
    if (!this.pool) return;

    await this.pool.query(`
      INSERT INTO provider_runs (
        run_id,
        trace_id,
        session_id,
        user_id,
        provider_id,
        mode,
        routing_mode,
        idempotency_key,
        status,
        updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()
      )
      ON CONFLICT (run_id)
      DO UPDATE SET
        trace_id = EXCLUDED.trace_id,
        session_id = EXCLUDED.session_id,
        user_id = EXCLUDED.user_id,
        provider_id = EXCLUDED.provider_id,
        mode = EXCLUDED.mode,
        routing_mode = EXCLUDED.routing_mode,
        idempotency_key = EXCLUDED.idempotency_key,
        status = EXCLUDED.status,
        updated_at = NOW()
    `, [
      run.runId,
      run.traceId,
      run.sessionId,
      run.userId,
      run.providerId,
      run.mode,
      run.routingMode,
      run.idempotencyKey,
      run.status,
    ]);
  }

  private sessionStreamKey(sessionId: string): string {
    return `${this.streamPrefix}${sessionId}`;
  }

  private async dispatchToRedis(payload: Record<string, unknown>, eventId: string, sessionId: string, seq: number): Promise<void> {
    if (!this.redis || !this.redis.isOpen) return;

    const serializedPayload = JSON.stringify(payload);
    const perSessionKey = this.sessionStreamKey(sessionId);

    await this.redis.xAdd(perSessionKey, '*', {
      eventId,
      sessionId,
      seq: String(seq),
      payload: serializedPayload,
    });

    await this.redis.xAdd(this.globalStreamKey, '*', {
      eventId,
      sessionId,
      seq: String(seq),
      streamKey: perSessionKey,
      payload: serializedPayload,
    });
  }

  async saveTimelineEvent(event: TimelineEvent): Promise<void> {
    const envelope = {
      schemaVersion: 'v0',
      type: 'timeline_event',
      event,
      stream: {
        key: this.sessionStreamKey(event.sessionId),
        globalKey: this.globalStreamKey,
      },
    };

    if (this.pool) {
      await this.pool.query(`
        INSERT INTO timeline_events (
          event_id,
          trace_id,
          session_id,
          user_id,
          provider_id,
          run_id,
          seq,
          timestamp_ms,
          kind,
          extension_kind,
          render_schema_ref,
          payload
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb
        )
        ON CONFLICT (event_id) DO NOTHING
      `, [
        event.eventId,
        event.traceId,
        event.sessionId,
        event.userId,
        event.providerId || null,
        event.runId || null,
        event.seq,
        event.timestampMs,
        event.kind,
        event.extensionKind || null,
        event.renderSchemaRef || null,
        JSON.stringify(event.payload),
      ]);

      await this.pool.query(`
        INSERT INTO outbox_events (
          event_id,
          session_id,
          channel,
          payload,
          status,
          attempts,
          max_attempts,
          next_retry_at,
          updated_at
        )
        VALUES ($1, $2, 'timeline', $3::jsonb, 'pending', 0, 12, NOW(), NOW())
        ON CONFLICT (event_id) DO UPDATE SET
          payload = EXCLUDED.payload,
          channel = EXCLUDED.channel,
          status = CASE
            WHEN outbox_events.status = 'delivered' THEN outbox_events.status
            WHEN outbox_events.status = 'consumed' THEN outbox_events.status
            ELSE 'pending'
          END,
          next_retry_at = CASE
            WHEN outbox_events.status = 'delivered' THEN outbox_events.next_retry_at
            WHEN outbox_events.status = 'consumed' THEN outbox_events.next_retry_at
            ELSE NOW()
          END,
          updated_at = NOW()
      `, [
        event.eventId,
        event.sessionId,
        JSON.stringify(envelope),
      ]);

      if (this.enableInlineDispatch) {
        await this.dispatchToRedis(envelope as Record<string, unknown>, event.eventId, event.sessionId, event.seq);
        await this.pool.query(`
          UPDATE outbox_events
          SET status = 'delivered',
              attempts = attempts + 1,
              delivered_at = NOW()
          WHERE event_id = $1
        `, [event.eventId]);
      }
      return;
    }

    if (this.redis && this.redis.isOpen) {
      await this.dispatchToRedis(envelope as Record<string, unknown>, event.eventId, event.sessionId, event.seq);
    }
  }

  async listTimelineEvents(sessionId: string, cursor: number): Promise<TimelineEvent[]> {
    if (!this.pool) return [];

    const result = await this.pool.query(`
      SELECT
        event_id,
        trace_id,
        session_id,
        user_id,
        provider_id,
        run_id,
        seq,
        timestamp_ms,
        kind,
        extension_kind,
        render_schema_ref,
        payload
      FROM timeline_events
      WHERE session_id = $1
        AND seq > $2
      ORDER BY seq ASC
      LIMIT 1000
    `, [sessionId, cursor]);

    return result.rows.map((row: Record<string, unknown>) => ({
      schemaVersion: 'v0',
      eventId: String(row.event_id),
      traceId: String(row.trace_id),
      sessionId: String(row.session_id),
      userId: String(row.user_id),
      providerId: row.provider_id ? String(row.provider_id) : undefined,
      runId: row.run_id ? String(row.run_id) : undefined,
      seq: toNumber(row.seq),
      timestampMs: toNumber(row.timestamp_ms),
      kind: String(row.kind) as TimelineEvent['kind'],
      extensionKind: row.extension_kind ? String(row.extension_kind) as TimelineEvent['extensionKind'] : undefined,
      renderSchemaRef: row.render_schema_ref ? String(row.render_schema_ref) : undefined,
      payload: (row.payload || {}) as Record<string, unknown>,
    }));
  }

  async loadUserContext(profileRef: string): Promise<Record<string, unknown> | null> {
    if (!this.pool) return null;

    const result = await this.pool.query(`
      SELECT snapshot
      FROM user_context_cache
      WHERE profile_ref = $1
        AND ttl_expires_at > NOW()
      LIMIT 1
    `, [profileRef]);

    const row = result.rows[0];
    if (!row) return null;
    return (row.snapshot || {}) as Record<string, unknown>;
  }

  async saveUserContext(record: UserContextCacheRecord): Promise<void> {
    if (!this.pool) return;

    await this.pool.query(`
      INSERT INTO user_context_cache (
        profile_ref,
        user_id,
        snapshot,
        ttl_expires_at,
        updated_at
      ) VALUES (
        $1,
        $2,
        $3::jsonb,
        to_timestamp(($4::bigint + $5::bigint) / 1000.0),
        NOW()
      )
      ON CONFLICT (profile_ref)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        snapshot = EXCLUDED.snapshot,
        ttl_expires_at = EXCLUDED.ttl_expires_at,
        updated_at = NOW()
    `, [
      record.profileRef,
      record.userId,
      JSON.stringify(record.snapshot),
      Date.now(),
      record.ttlMs,
    ]);
  }
}
