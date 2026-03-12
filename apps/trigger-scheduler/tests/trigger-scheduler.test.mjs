import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ports = {
  platform: 9984,
  scheduler: 9983,
};

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function startService(name, args, env = {}) {
  const child = spawn('pnpm', args, {
    cwd: rootDir,
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

async function waitForHealth(url, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await sleep(250);
  }
  throw new Error(`health timeout for ${url}`);
}

async function httpPost(url, body, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers,
    },
    body,
  });
  const json = await response.json();
  return { status: response.status, json };
}

test('trigger scheduler polls due triggers and verifies direct webhooks', async (t) => {
  const webhookSecret = 'super-secret-value';
  const seenScheduleDispatchKeys = new Set();
  const seenWebhookDispatchKeys = new Set();
  const scheduleDispatches = [];
  const webhookDispatches = [];

  const platformServer = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const body = rawBody ? JSON.parse(rawBody) : {};

      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === 'GET' && req.url?.startsWith('/internal/trigger-bindings/due')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          schemaVersion: 'v1',
          triggers: [
            {
              triggerBindingId: 'trigger-schedule-1',
              agentId: 'agent-1',
              workspaceId: 'workspace-1',
              nextTriggerAt: 1700000000000,
              configJson: {
                intervalMs: 1000,
              },
            },
          ],
        }));
        return;
      }

      if (req.method === 'GET' && req.url === '/internal/webhook-triggers/public-key-1/runtime-config') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          schemaVersion: 'v1',
          trigger: {
            triggerBindingId: 'trigger-webhook-1',
            agentId: 'agent-1',
            workspaceId: 'workspace-1',
            publicTriggerKey: 'public-key-1',
            secretRefId: 'secret-1',
            secretEnvKey: 'TEST_WEBHOOK_SECRET',
            signatureHeader: 'x-signature',
            timestampHeader: 'x-ts',
            dedupeHeader: 'x-delivery-id',
            replayWindowMs: 300000,
          },
        }));
        return;
      }

      if (req.method === 'POST' && req.url === '/internal/trigger-bindings/trigger-schedule-1/dispatch') {
        const duplicate = seenScheduleDispatchKeys.has(body.dispatchKey);
        seenScheduleDispatchKeys.add(body.dispatchKey);
        scheduleDispatches.push({ body, duplicate });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          schemaVersion: 'v1',
          triggerDispatch: {
            triggerDispatchId: `schedule-${scheduleDispatches.length}`,
            triggerBindingId: 'trigger-schedule-1',
            dispatchKey: body.dispatchKey,
            sourceType: 'schedule',
            status: 'dispatched',
            runId: duplicate ? 'run-duplicate' : 'run-schedule-1',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          runId: duplicate ? 'run-duplicate' : 'run-schedule-1',
          duplicate,
        }));
        return;
      }

      if (req.method === 'POST' && req.url === '/internal/webhook-triggers/public-key-1/dispatch') {
        const duplicate = seenWebhookDispatchKeys.has(body.dispatchKey);
        seenWebhookDispatchKeys.add(body.dispatchKey);
        webhookDispatches.push({ body, duplicate });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          schemaVersion: 'v1',
          triggerDispatch: {
            triggerDispatchId: `webhook-${webhookDispatches.length}`,
            triggerBindingId: 'trigger-webhook-1',
            dispatchKey: body.dispatchKey,
            sourceType: 'webhook',
            status: 'dispatched',
            runId: duplicate ? 'run-webhook-duplicate' : 'run-webhook-1',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          runId: duplicate ? 'run-webhook-duplicate' : 'run-webhook-1',
          duplicate,
        }));
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found', code: 'NOT_FOUND' }));
    });
  });

  await new Promise((resolvePromise) => platformServer.listen(ports.platform, resolvePromise));

  const scheduler = startService('scheduler-b5', ['--filter', '@baseinterface/trigger-scheduler', 'start'], {
    PORT: String(ports.scheduler),
    UNIASSIST_WORKFLOW_PLATFORM_BASE_URL: `http://127.0.0.1:${ports.platform}`,
    UNIASSIST_TRIGGER_SCHEDULER_POLL_INTERVAL_MS: '1000',
    UNIASSIST_INTERNAL_AUTH_MODE: 'off',
    TEST_WEBHOOK_SECRET: webhookSecret,
  });

  t.after(() => {
    scheduler.kill('SIGTERM');
    platformServer.close();
  });

  await waitForHealth(`http://127.0.0.1:${ports.scheduler}/health`);

  await sleep(2200);
  assert.ok(scheduleDispatches.length >= 1);
  assert.equal(scheduleDispatches.filter((entry) => entry.duplicate === false).length, 1);
  assert.ok(scheduleDispatches.every((entry) => entry.body.dispatchKey === 'schedule:trigger-schedule-1:1700000000000'));

  const manualScheduleFire = await httpPost(
    `http://127.0.0.1:${ports.scheduler}/internal/triggers/schedule/trigger-schedule-1/fire`,
    JSON.stringify({
      schemaVersion: 'v1',
      dispatchKey: 'schedule:manual:1',
      firedAt: 1700000001234,
      payload: { source: 'manual' },
    }),
    {
      'content-type': 'application/json',
    },
  );
  assert.equal(manualScheduleFire.status, 202);

  const timestamp = String(Date.now());
  const rawBody = JSON.stringify({ hello: 'world' });
  const signature = createHmac('sha256', webhookSecret).update(`${timestamp}.${rawBody}`).digest('hex');

  const webhookFirst = await httpPost(
    `http://127.0.0.1:${ports.scheduler}/hooks/agent-triggers/public-key-1`,
    rawBody,
    {
      'content-type': 'application/json',
      'x-ts': timestamp,
      'x-signature': signature,
      'x-delivery-id': 'delivery-1',
    },
  );
  assert.equal(webhookFirst.status, 202);
  assert.equal(webhookDispatches.length, 1);
  assert.equal(webhookDispatches[0].duplicate, false);
  assert.equal(webhookDispatches[0].body.payload.hello, 'world');

  const webhookReplay = await httpPost(
    `http://127.0.0.1:${ports.scheduler}/hooks/agent-triggers/public-key-1`,
    rawBody,
    {
      'content-type': 'application/json',
      'x-ts': timestamp,
      'x-signature': signature,
      'x-delivery-id': 'delivery-1',
    },
  );
  assert.equal(webhookReplay.status, 409);
  assert.equal(webhookReplay.json.code, 'WEBHOOK_REPLAY_DETECTED');
  assert.equal(webhookDispatches.length, 2);
  assert.equal(webhookDispatches[1].duplicate, true);

  const invalidWebhook = await httpPost(
    `http://127.0.0.1:${ports.scheduler}/hooks/agent-triggers/public-key-1`,
    rawBody,
    {
      'content-type': 'application/json',
      'x-ts': String(Date.now()),
      'x-signature': 'bad-signature',
      'x-delivery-id': 'delivery-2',
    },
  );
  assert.equal(invalidWebhook.status, 401);
  assert.equal(invalidWebhook.json.code, 'INVALID_WEBHOOK_SIGNATURE');
  assert.equal(webhookDispatches.length, 2);

  const invalidJsonTimestamp = String(Date.now());
  const invalidJsonBody = '{"hello":';
  const invalidJsonSignature = createHmac('sha256', webhookSecret)
    .update(`${invalidJsonTimestamp}.${invalidJsonBody}`)
    .digest('hex');

  const invalidJsonWebhook = await httpPost(
    `http://127.0.0.1:${ports.scheduler}/hooks/agent-triggers/public-key-1`,
    invalidJsonBody,
    {
      'content-type': 'application/json',
      'x-ts': invalidJsonTimestamp,
      'x-signature': invalidJsonSignature,
      'x-delivery-id': 'delivery-3',
    },
  );
  assert.equal(invalidJsonWebhook.status, 400);
  assert.equal(invalidJsonWebhook.json.code, 'INVALID_WEBHOOK_PAYLOAD');
  assert.equal(webhookDispatches.length, 2);
});
