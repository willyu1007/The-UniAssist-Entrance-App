import crypto from 'node:crypto';
import express, { type Request } from 'express';

import type { IngestAck, InteractionEvent, UnifiedUserInput } from '@baseinterface/contracts';

const PORT = Number(process.env.PORT || 8788);
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8787';
const ADAPTER_SECRET = process.env.UNIASSIST_ADAPTER_SECRET || 'dev-adapter-secret';

type RawBodyRequest = Request & { rawBody?: string };

const app = express();
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as RawBodyRequest).rawBody = buf.toString('utf8');
  },
}));

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

  const response = await fetch(`${GATEWAY_URL}/v0/ingest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-uniassist-signature': signed.signature,
      'x-uniassist-timestamp': signed.timestamp,
      'x-uniassist-nonce': signed.nonce,
    },
    body: raw,
  });

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
  console.log(`[adapter-wechat] listening on :${PORT}`);
});
