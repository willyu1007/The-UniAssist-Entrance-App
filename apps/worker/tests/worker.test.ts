import assert from 'node:assert/strict';
import test from 'node:test';

import type { InternalAuthConfig } from '@baseinterface/shared';
import { DeliveryWorker, type WorkerConfig } from '../src/worker.ts';

const internalAuthConfig: InternalAuthConfig = {
  mode: 'off',
  serviceId: 'worker',
  issuer: 'worker',
  signingKid: 'kid',
  keys: {},
  tokenTtlSec: 300,
  clockSkewSec: 30,
  nonceTtlSec: 300,
  replayBackend: 'memory',
};

function createConfig(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    databaseUrl: '',
    redisUrl: '',
    streamPrefix: 'uniassist:timeline:',
    globalStreamKey: 'uniassist:timeline:all',
    streamGroup: 'ua-delivery',
    consumerName: 'worker-test',
    outboxEnabled: false,
    consumerEnabled: false,
    outboxPollMs: 1000,
    outboxBatchSize: 100,
    outboxMaxAttempts: 12,
    outboxBackoffBaseMs: 1000,
    outboxBackoffMaxMs: 300000,
    consumerBlockMs: 2000,
    consumerBatchSize: 100,
    gatewayBaseUrl: undefined,
    gatewayServiceId: 'gateway',
    internalAuthConfig,
    ...overrides,
  };
}

test('worker skips workflow formal event projection when gateway is not configured', async () => {
  const worker = new DeliveryWorker(createConfig());
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called');
  }) as typeof fetch;

  try {
    await (worker as any).forwardWorkflowFormalEvent({ runId: 'run-1' });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(fetchCalled, false);
});

test('worker treats gateway projection failures as non-fatal sidecar errors', async () => {
  const worker = new DeliveryWorker(createConfig({
    gatewayBaseUrl: 'http://127.0.0.1:8787',
  }));
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async (input) => {
    fetchCalls += 1;
    assert.equal(String(input), 'http://127.0.0.1:8787/internal/workflow-events');
    return new Response('projection down', {
      status: 503,
      headers: {
        'content-type': 'text/plain',
      },
    });
  }) as typeof fetch;

  try {
    await assert.doesNotReject(
      async () => await (worker as any).forwardWorkflowFormalEvent({ runId: 'run-2' }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(fetchCalls, 1);
});
