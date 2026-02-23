import os from 'node:os';

import { Pool } from 'pg';
import { createClient, type RedisClientType } from 'redis';

type OutboxRow = {
  id: number;
  eventId: string;
  sessionId: string;
  channel: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
};

type WorkerConfig = {
  databaseUrl: string;
  redisUrl: string;
  streamPrefix: string;
  globalStreamKey: string;
  streamGroup: string;
  consumerName: string;
  outboxEnabled: boolean;
  consumerEnabled: boolean;
  outboxPollMs: number;
  outboxBatchSize: number;
  outboxMaxAttempts: number;
  outboxBackoffBaseMs: number;
  outboxBackoffMaxMs: number;
  consumerBlockMs: number;
  consumerBatchSize: number;
};

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function loadConfig(): WorkerConfig {
  const streamPrefix = process.env.UNIASSIST_STREAM_PREFIX || 'uniassist:timeline:';
  return {
    databaseUrl: process.env.DATABASE_URL || '',
    redisUrl: process.env.REDIS_URL || '',
    streamPrefix,
    globalStreamKey: process.env.UNIASSIST_STREAM_GLOBAL_KEY || `${streamPrefix}all`,
    streamGroup: process.env.UNIASSIST_STREAM_GROUP || 'ua-delivery',
    consumerName: process.env.UNIASSIST_STREAM_CONSUMER || `${os.hostname()}-${process.pid}`,
    outboxEnabled: toBool(process.env.WORKER_ENABLE_OUTBOX, true),
    consumerEnabled: toBool(process.env.WORKER_ENABLE_CONSUMER, true),
    outboxPollMs: toInt(process.env.OUTBOX_POLL_MS, 1000),
    outboxBatchSize: toInt(process.env.OUTBOX_BATCH_SIZE, 100),
    outboxMaxAttempts: toInt(process.env.OUTBOX_MAX_ATTEMPTS, 12),
    outboxBackoffBaseMs: toInt(process.env.OUTBOX_BACKOFF_BASE_MS, 1000),
    outboxBackoffMaxMs: toInt(process.env.OUTBOX_BACKOFF_MAX_MS, 300000),
    consumerBlockMs: toInt(process.env.STREAM_CONSUMER_BLOCK_MS, 2000),
    consumerBatchSize: toInt(process.env.STREAM_CONSUMER_BATCH_SIZE, 100),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

class DeliveryWorker {
  private readonly config: WorkerConfig;

  private readonly pool?: Pool;

  private readonly redis?: RedisClientType;

  private running = false;

  private consumerGroupReady = false;

  constructor(config: WorkerConfig) {
    this.config = config;

    if (config.databaseUrl) {
      this.pool = new Pool({
        connectionString: config.databaseUrl,
      });
    }

    if (config.redisUrl) {
      this.redis = createClient({ url: config.redisUrl });
      this.redis.on('error', (error: unknown) => {
        console.error('[worker][redis] error', error);
      });
    }
  }

  async init(): Promise<void> {
    if (this.config.outboxEnabled && !this.pool) {
      throw new Error('DATABASE_URL is required when WORKER_ENABLE_OUTBOX=true');
    }
    if ((this.config.outboxEnabled || this.config.consumerEnabled) && !this.redis) {
      throw new Error('REDIS_URL is required when outbox/consumer worker is enabled');
    }

    if (this.redis && !this.redis.isOpen) {
      await this.redis.connect();
    }

    if (this.pool) {
      await this.ensureOutboxSchema();
    }

    if (this.config.consumerEnabled) {
      await this.ensureConsumerGroup();
    }
  }

  async run(): Promise<void> {
    this.running = true;
    console.log('[worker] started', {
      outboxEnabled: this.config.outboxEnabled,
      consumerEnabled: this.config.consumerEnabled,
      streamGroup: this.config.streamGroup,
      consumerName: this.config.consumerName,
      globalStreamKey: this.config.globalStreamKey,
    });

    await Promise.all([
      this.outboxLoop(),
      this.consumerLoop(),
    ]);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    console.log('[worker] stopping...');

    if (this.redis && this.redis.isOpen) {
      await this.redis.quit();
    }
    if (this.pool) {
      await this.pool.end();
    }
    console.log('[worker] stopped');
  }

  private async ensureOutboxSchema(): Promise<void> {
    if (!this.pool) return;

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
      CREATE INDEX IF NOT EXISTS idx_outbox_events_status_created_at ON outbox_events(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_outbox_events_status_next_retry ON outbox_events(status, next_retry_at);
    `);
  }

  private async ensureConsumerGroup(): Promise<void> {
    if (!this.redis || this.consumerGroupReady) return;
    try {
      await this.redis.xGroupCreate(this.config.globalStreamKey, this.config.streamGroup, '0', {
        MKSTREAM: true,
      });
      this.consumerGroupReady = true;
      return;
    } catch (error) {
      const message = String(error);
      if (message.includes('BUSYGROUP')) {
        this.consumerGroupReady = true;
        return;
      }
      throw error;
    }
  }

  private async outboxLoop(): Promise<void> {
    while (this.running) {
      try {
        if (!this.config.outboxEnabled) {
          await sleep(this.config.outboxPollMs);
          continue;
        }
        await this.processOutboxBatch();
      } catch (error) {
        console.error('[worker][outbox] loop error', error);
      }
      await sleep(this.config.outboxPollMs);
    }
  }

  private async consumerLoop(): Promise<void> {
    while (this.running) {
      try {
        if (!this.config.consumerEnabled) {
          await sleep(this.config.outboxPollMs);
          continue;
        }
        await this.consumeStreamOnce();
      } catch (error) {
        console.error('[worker][consumer] loop error', error);
        await sleep(1000);
      }
    }
  }

  private async claimOutboxBatch(): Promise<OutboxRow[]> {
    if (!this.pool) return [];

    const result = await this.pool.query(`
      WITH picked AS (
        SELECT id
        FROM outbox_events
        WHERE status IN ('pending', 'failed')
          AND next_retry_at <= NOW()
          AND attempts < max_attempts
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox_events o
      SET status = 'processing',
          locked_by = $2,
          locked_at = NOW(),
          updated_at = NOW()
      FROM picked
      WHERE o.id = picked.id
      RETURNING o.id, o.event_id, o.session_id, o.channel, o.payload, o.attempts, o.max_attempts
    `, [this.config.outboxBatchSize, this.config.consumerName]);

    return result.rows.map((row: Record<string, unknown>) => ({
      id: Number(row.id),
      eventId: String(row.event_id),
      sessionId: String(row.session_id),
      channel: String(row.channel),
      payload: toRecord(row.payload),
      attempts: Number(row.attempts),
      maxAttempts: Number(row.max_attempts || this.config.outboxMaxAttempts),
    }));
  }

  private backoffMs(nextAttempt: number): number {
    const raw = this.config.outboxBackoffBaseMs * Math.pow(2, Math.max(nextAttempt - 1, 0));
    return Math.min(this.config.outboxBackoffMaxMs, raw);
  }

  private resolveSessionStreamKey(row: OutboxRow): string {
    const payload = toRecord(row.payload);
    const streamMeta = toRecord(payload.stream);
    return toStringValue(streamMeta.key) || `${this.config.streamPrefix}${row.sessionId}`;
  }

  private resolveGlobalStreamKey(row: OutboxRow): string {
    const payload = toRecord(row.payload);
    const streamMeta = toRecord(payload.stream);
    return toStringValue(streamMeta.globalKey) || this.config.globalStreamKey;
  }

  private async markDelivered(row: OutboxRow, nextAttempts: number): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(`
      UPDATE outbox_events
      SET status = CASE
            WHEN status = 'consumed' THEN 'consumed'
            ELSE 'delivered'
          END,
          attempts = GREATEST(attempts, $2),
          last_error = NULL,
          locked_by = NULL,
          locked_at = NULL,
          delivered_at = COALESCE(delivered_at, NOW()),
          updated_at = NOW()
      WHERE id = $1
    `, [row.id, nextAttempts]);
  }

  private async markFailed(row: OutboxRow, nextAttempts: number, errorMessage: string): Promise<void> {
    if (!this.pool) return;

    const terminal = nextAttempts >= Math.min(this.config.outboxMaxAttempts, row.maxAttempts || this.config.outboxMaxAttempts);
    const status = terminal ? 'dead_letter' : 'failed';
    const delayMs = terminal ? 0 : this.backoffMs(nextAttempts);

    await this.pool.query(`
      UPDATE outbox_events
      SET status = $2,
          attempts = $3,
          last_error = $4,
          next_retry_at = CASE
            WHEN $5::INT = 0 THEN NOW()
            ELSE NOW() + ($5::TEXT || ' milliseconds')::INTERVAL
          END,
          locked_by = NULL,
          locked_at = NULL,
          updated_at = NOW()
      WHERE id = $1
    `, [row.id, status, nextAttempts, errorMessage.slice(0, 4000), delayMs]);
  }

  private async processOutboxBatch(): Promise<void> {
    if (!this.pool || !this.redis || !this.redis.isOpen) return;

    const batch = await this.claimOutboxBatch();
    if (batch.length === 0) return;

    for (const row of batch) {
      const nextAttempts = row.attempts + 1;
      try {
        const payloadText = JSON.stringify(row.payload);
        const sessionStreamKey = this.resolveSessionStreamKey(row);
        const globalStreamKey = this.resolveGlobalStreamKey(row);

        await this.redis.xAdd(sessionStreamKey, '*', {
          eventId: row.eventId,
          sessionId: row.sessionId,
          payload: payloadText,
        });
        await this.redis.xAdd(globalStreamKey, '*', {
          eventId: row.eventId,
          sessionId: row.sessionId,
          streamKey: sessionStreamKey,
          payload: payloadText,
        });

        await this.markDelivered(row, nextAttempts);
      } catch (error) {
        await this.markFailed(row, nextAttempts, String(error));
      }
    }
  }

  private async markConsumed(eventId: string): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(`
      UPDATE outbox_events
      SET status = 'consumed',
          delivered_at = COALESCE(delivered_at, NOW()),
          consumed_at = COALESCE(consumed_at, NOW()),
          consumed_by = $2,
          locked_by = NULL,
          locked_at = NULL,
          updated_at = NOW()
      WHERE event_id = $1
        AND status <> 'dead_letter'
    `, [eventId, this.config.consumerName]);
  }

  private async consumeStreamOnce(): Promise<void> {
    if (!this.redis || !this.redis.isOpen) return;

    await this.ensureConsumerGroup();

    const messages = await this.redis.xReadGroup(
      this.config.streamGroup,
      this.config.consumerName,
      [{ key: this.config.globalStreamKey, id: '>' }],
      {
        COUNT: this.config.consumerBatchSize,
        BLOCK: this.config.consumerBlockMs,
      },
    );

    if (!messages || messages.length === 0) return;

    for (const stream of messages) {
      const streamName = String(stream.name);
      for (const message of stream.messages) {
        const values = toRecord(message.message);
        const eventId = toStringValue(values.eventId);
        if (eventId) {
          await this.markConsumed(eventId);
        }
        await this.redis.xAck(streamName, this.config.streamGroup, message.id);
      }
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const worker = new DeliveryWorker(config);

  const handleSignal = async (signal: string): Promise<void> => {
    console.log(`[worker] received ${signal}`);
    await worker.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void handleSignal('SIGINT');
  });
  process.on('SIGTERM', () => {
    void handleSignal('SIGTERM');
  });

  await worker.init();
  await worker.run();
}

main().catch((error) => {
  console.error('[worker] fatal', error);
  process.exit(1);
});
