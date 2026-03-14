import crypto from 'node:crypto';

import type { Request, Response } from 'express';
import express from 'express';

import { createLogger, createMemoryNonceStore, verifyInternalAuthRequest } from '@uniassist/shared';
import { PlatformClient, PlatformClientError } from './platform-client';
import {
  INTERNAL_AUTH_CONFIG,
  PORT,
  SCHEDULE_POLL_INTERVAL_MS,
  WORKFLOW_PLATFORM_BASE_URL,
  WORKFLOW_PLATFORM_SERVICE_ID,
  now,
} from './config';

type RawBodyRequest = Request & {
  rawBody?: string;
  rawBuffer?: Buffer;
};

class SchedulerError extends Error {
  readonly code: string;

  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'SchedulerError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const logger = createLogger({ service: 'trigger-scheduler' });
const internalNonceStore = createMemoryNonceStore();
const platformClient = new PlatformClient({
  baseUrl: WORKFLOW_PLATFORM_BASE_URL,
  internalAuthConfig: INTERNAL_AUTH_CONFIG,
  platformServiceId: WORKFLOW_PLATFORM_SERVICE_ID,
});
const app = express();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Array.isArray(value) === false;
}

function requireSchemaVersion(value: unknown): void {
  if (value !== 'v1') {
    throw new SchedulerError(400, 'INVALID_SCHEMA_VERSION', 'schemaVersion must be v1');
  }
}

function optionalPositiveInt(value: unknown): number | undefined {
  const raw = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  return Math.trunc(raw);
}

function headersToRecord(headers: Request['headers']): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return [key.toLowerCase(), value[0] || ''];
        }
        return [key.toLowerCase(), value || ''];
      })
      .filter(([, value]) => value !== ''),
  );
}

function parseWebhookPayload(rawBody: string, contentType: string | undefined): Record<string, unknown> {
  const normalizedType = (contentType || '').toLowerCase();
  if (rawBody === '') {
    return {};
  }
  if (normalizedType.includes('application/json')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody) as unknown;
    } catch {
      throw new SchedulerError(400, 'INVALID_WEBHOOK_PAYLOAD', 'webhook payload is not valid JSON');
    }
    if (isRecord(parsed)) {
      return parsed;
    }
    return { value: parsed };
  }
  return { rawBody };
}

function buildWebhookSignature(secret: string, timestamp: string, rawBody: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

function matchesWebhookSignature(actual: string, expectedHex: string): boolean {
  const normalized = actual.trim();
  const expectedVariants = [expectedHex, `sha256=${expectedHex}`, `v1=${expectedHex}`];
  return expectedVariants.some((candidate) => {
    const actualBuffer = Buffer.from(normalized);
    const candidateBuffer = Buffer.from(candidate);
    return actualBuffer.length === candidateBuffer.length && crypto.timingSafeEqual(actualBuffer, candidateBuffer);
  });
}

function buildWebhookDispatchKey(publicTriggerKey: string, timestamp: string, rawBody: string, dedupeHeaderValue?: string): string {
  if (dedupeHeaderValue && dedupeHeaderValue.trim() !== '') {
    return `webhook:${publicTriggerKey}:${dedupeHeaderValue.trim()}`;
  }
  const fallback = crypto.createHash('sha256').update(`${timestamp}.${rawBody}`).digest('hex');
  return `webhook:${publicTriggerKey}:${fallback}`;
}

async function guardInternalAuth(
  req: RawBodyRequest,
  res: Response,
  expectedAudience: string,
): Promise<boolean> {
  if (INTERNAL_AUTH_CONFIG.mode === 'off') return true;
  const verification = await verifyInternalAuthRequest({
    method: req.method,
    path: req.path,
    rawBody: req.rawBody || '',
    headers: req.headers as Record<string, string | string[] | undefined>,
    config: INTERNAL_AUTH_CONFIG,
    nonceStore: internalNonceStore,
    expectedAudience,
    allowedSubjects: [WORKFLOW_PLATFORM_SERVICE_ID, INTERNAL_AUTH_CONFIG.serviceId],
  });
  if (verification.ok || INTERNAL_AUTH_CONFIG.mode === 'audit') {
    return true;
  }
  res.status(verification.status).json({
    schemaVersion: 'v1',
    error: verification.message,
    code: verification.code,
  });
  return false;
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof SchedulerError || error instanceof PlatformClientError) {
    res.status(error.statusCode).json({
      schemaVersion: 'v1',
      error: error.message,
      code: error.code,
    });
    return;
  }
  res.status(500).json({
    schemaVersion: 'v1',
    error: error instanceof Error ? error.message : String(error),
    code: 'INTERNAL_ERROR',
  });
}

app.use((req, res, next) => {
  const startedAt = now();
  res.on('finish', () => {
    logger.info('http request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: now() - startedAt,
    });
  });
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'trigger-scheduler' });
});

app.post('/hooks/agent-triggers/:publicTriggerKey', express.raw({
  type: '*/*',
  verify: (req, _res, buf) => {
    (req as RawBodyRequest).rawBody = buf.toString('utf8');
    (req as RawBodyRequest).rawBuffer = Buffer.from(buf);
  },
}), async (req: RawBodyRequest, res) => {
  try {
    const publicTriggerKey = req.params.publicTriggerKey;
    const runtimeConfig = await platformClient.getWebhookTriggerRuntimeConfig(publicTriggerKey);
    const headers = headersToRecord(req.headers);
    const signatureHeader = runtimeConfig.trigger.signatureHeader.toLowerCase();
    const timestampHeader = runtimeConfig.trigger.timestampHeader.toLowerCase();
    const dedupeHeader = runtimeConfig.trigger.dedupeHeader.toLowerCase();
    const timestampValue = headers[timestampHeader];
    if (!timestampValue) {
      throw new SchedulerError(401, 'WEBHOOK_TIMESTAMP_REQUIRED', 'webhook timestamp header is required');
    }
    const timestampMs = Number(timestampValue);
    if (!Number.isFinite(timestampMs)) {
      throw new SchedulerError(401, 'WEBHOOK_TIMESTAMP_INVALID', 'webhook timestamp header is invalid');
    }
    if (Math.abs(now() - timestampMs) > runtimeConfig.trigger.replayWindowMs) {
      throw new SchedulerError(401, 'WEBHOOK_TIMESTAMP_EXPIRED', 'webhook timestamp is outside the replay window');
    }
    const signatureValue = headers[signatureHeader];
    if (!signatureValue) {
      throw new SchedulerError(401, 'WEBHOOK_SIGNATURE_REQUIRED', 'webhook signature header is required');
    }
    const rawBody = req.rawBody || '';
    const secretValue = process.env[runtimeConfig.trigger.secretEnvKey];
    if (!secretValue) {
      throw new SchedulerError(500, 'WEBHOOK_SECRET_ENV_MISSING', `missing env secret ${runtimeConfig.trigger.secretEnvKey}`);
    }
    const expectedSignature = buildWebhookSignature(secretValue, timestampValue, rawBody);
    if (!matchesWebhookSignature(signatureValue, expectedSignature)) {
      throw new SchedulerError(401, 'INVALID_WEBHOOK_SIGNATURE', 'webhook signature is invalid');
    }
    const dispatchKey = buildWebhookDispatchKey(publicTriggerKey, timestampValue, rawBody, headers[dedupeHeader]);
    const response = await platformClient.dispatchWebhookTrigger(publicTriggerKey, {
      schemaVersion: 'v1',
      dispatchKey,
      firedAt: timestampMs,
      payload: parseWebhookPayload(rawBody, req.headers['content-type']),
      headers,
    });
    if (response.duplicate) {
      res.status(409).json({
        schemaVersion: 'v1',
        error: 'webhook replay detected',
        code: 'WEBHOOK_REPLAY_DETECTED',
      });
      return;
    }
    res.status(202).json(response);
  } catch (error) {
    handleError(res, error);
  }
});

app.use(express.json({
  verify: (req, _res, buf) => {
    (req as RawBodyRequest).rawBody = buf.toString('utf8');
  },
}));

app.post('/internal/triggers/schedule/:triggerBindingId/fire', async (req: RawBodyRequest, res) => {
  if (!(await guardInternalAuth(req, res, INTERNAL_AUTH_CONFIG.serviceId))) return;
  try {
    const body = isRecord(req.body) ? req.body : {};
    if (body.schemaVersion !== undefined) {
      requireSchemaVersion(body.schemaVersion);
    }
    const firedAt = optionalPositiveInt(body.firedAt) || now();
    const dispatchKey = typeof body.dispatchKey === 'string' && body.dispatchKey.trim() !== ''
      ? body.dispatchKey.trim()
      : `schedule:${req.params.triggerBindingId}:${firedAt}`;
    const payload = body.payload === undefined
      ? undefined
      : (() => {
          if (!isRecord(body.payload)) {
            throw new SchedulerError(400, 'INVALID_REQUEST', 'payload must be an object');
          }
          return body.payload;
        })();
    const headers = body.headers === undefined
      ? undefined
      : (() => {
          if (!isRecord(body.headers)) {
            throw new SchedulerError(400, 'INVALID_REQUEST', 'headers must be an object');
          }
          return Object.fromEntries(
            Object.entries(body.headers).map(([key, value]) => [key, String(value)]),
          );
        })();
    const response = await platformClient.dispatchScheduleTrigger(req.params.triggerBindingId, {
      schemaVersion: 'v1',
      dispatchKey,
      firedAt,
      payload,
      headers,
    });
    res.status(response.duplicate ? 200 : 202).json(response);
  } catch (error) {
    handleError(res, error);
  }
});

let pollInFlight = false;

async function pollDueScheduleTriggers(): Promise<void> {
  if (pollInFlight) {
    return;
  }
  pollInFlight = true;
  try {
    const due = await platformClient.listDueScheduleTriggers(now());
    for (const trigger of due.triggers) {
      const dispatchKey = `schedule:${trigger.triggerBindingId}:${trigger.nextTriggerAt}`;
      const response = await platformClient.dispatchScheduleTrigger(trigger.triggerBindingId, {
        schemaVersion: 'v1',
        dispatchKey,
        firedAt: trigger.nextTriggerAt,
        payload: {
          scheduledFor: trigger.nextTriggerAt,
          triggerKind: 'schedule',
        },
        headers: {
          'x-uniassist-trigger-source': 'scheduler',
        },
      });
      logger.info('schedule trigger processed', {
        triggerBindingId: trigger.triggerBindingId,
        dispatchKey,
        duplicate: response.duplicate || false,
        runId: response.runId,
      });
    }
  } catch (error) {
    logger.error('schedule poll failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    pollInFlight = false;
  }
}

const pollTimer = setInterval(() => {
  void pollDueScheduleTriggers();
}, Math.max(1000, SCHEDULE_POLL_INTERVAL_MS));
pollTimer.unref?.();
void pollDueScheduleTriggers();

const server = app.listen(PORT, () => {
  logger.info('trigger scheduler listening', {
    port: PORT,
    platformBaseUrl: WORKFLOW_PLATFORM_BASE_URL,
    pollIntervalMs: Math.max(1000, SCHEDULE_POLL_INTERVAL_MS),
  });
});

async function shutdown(): Promise<void> {
  clearInterval(pollTimer);
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});
