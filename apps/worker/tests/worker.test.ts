import assert from 'node:assert/strict';
import test from 'node:test';

import type { InternalAuthConfig } from '@uniassist/shared';
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
    internalAuthConfig,
    ...overrides,
  };
}

test('worker acknowledges workflow formal events without projection fetches', async () => {
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
