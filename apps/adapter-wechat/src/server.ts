import crypto from 'node:crypto';
import express, { type Request } from 'express';

import type { IngestAck, InteractionEvent, UnifiedUserInput } from '@baseinterface/contracts';
import {
  buildInternalAuthHeaders,
  createLogger,
  loadInternalAuthConfigFromEnv,
  serializeError,
} from '@baseinterface/shared';

const PORT = Number(process.env.PORT || 8788);
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8787';
const ADAPTER_SECRET = process.env.UNIASSIST_ADAPTER_SECRET || 'dev-adapter-secret';
const INTERNAL_AUTH_DEFAULT_SERVICE_ID = 'adapter-wechat';
const INTERNAL_AUTH_CONFIG = (() => {
  const config = loadInternalAuthConfigFromEnv(process.env);
  if (config.serviceId === 'unknown') {
    config.serviceId = INTERNAL_AUTH_DEFAULT_SERVICE_ID;
  }
  return config;
})();
const logger = createLogger({ service: 'adapter-wechat' });

type RawBodyRequest = Request & { rawBody?: string };

const app = express();
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as RawBodyRequest).rawBody = buf.toString('utf8');
  },
}));

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info('http request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  next();
});

function signBody(rawBody: string): { signature: string; timestamp: string; nonce: string } {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const signature = crypto
    .createHmac('sha256', ADAPTER_SECRET)
    .update(`${timestamp}.${nonce}.${rawBody}`)
    .digest('hex');
  return { signature, timestamp, nonce };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'adapter-wechat' });
});

app.post('/wechat/webhook', async (req: RawBodyRequest, res) => {
  const { openid, text, messageId } = req.body as {
    openid?: string;
    text?: string;
    messageId?: string;
  };

  if (!openid || !text) {
    res.status(400).json({ ok: false, message: 'openid and text are required' });
    return;
  }

  const input: UnifiedUserInput = {
    schemaVersion: 'v0',
    traceId: crypto.randomUUID(),
    userId: `wx:${openid}`,
    sessionId: `wx-session:${openid}`,
    source: 'wechat',
    channel: {
      id: openid,
      type: 'wechat',
      messageId: messageId || crypto.randomUUID(),
    },
    text,
    timestampMs: Date.now(),
  };

  const raw = JSON.stringify(input);
  const signed = signBody(raw);
  const internalHeaders = buildInternalAuthHeaders(INTERNAL_AUTH_CONFIG, {
    method: 'POST',
    path: '/v0/ingest',
    rawBody: raw,
    audience: 'gateway',
    scopes: [],
  });

  let response: Response;
  try {
    response = await fetch(`${GATEWAY_URL}/v0/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-uniassist-signature': signed.signature,
        'x-uniassist-timestamp': signed.timestamp,
        'x-uniassist-nonce': signed.nonce,
        authorization: internalHeaders.authorization,
        'x-uniassist-internal-kid': internalHeaders['x-uniassist-internal-kid'],
        'x-uniassist-internal-ts': internalHeaders['x-uniassist-internal-ts'],
        'x-uniassist-internal-nonce': internalHeaders['x-uniassist-internal-nonce'],
        'x-uniassist-internal-signature': internalHeaders['x-uniassist-internal-signature'],
      },
      body: raw,
    });
  } catch (error) {
    logger.error('gateway ingest request failed', {
      gatewayUrl: GATEWAY_URL,
      ...serializeError(error),
    });
    res.status(502).json({ ok: false, message: 'gateway ingest failed', detail: 'network_or_gateway_unreachable' });
    return;
  }

  if (!response.ok) {
    const detail = await response.text();
    res.status(502).json({ ok: false, message: 'gateway ingest failed', detail });
    return;
  }

  const ack = (await response.json()) as IngestAck;
  const firstAck = ack.ackEvents.find((event: InteractionEvent) => event.type === 'ack');
  const replyText = firstAck?.type === 'ack' ? firstAck.message || '已收到，正在处理。' : '已收到，正在处理。';

  res.json({
    ok: true,
    traceId: ack.traceId,
    sessionId: ack.sessionId,
    runs: ack.runs,
    replyText,
  });
});

app.listen(PORT, () => {
  logger.info('adapter-wechat listening', { port: PORT, gatewayUrl: GATEWAY_URL });
});
