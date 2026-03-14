import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  WorkflowFormalEvent,
  WorkflowTemplateSpec,
} from '@baseinterface/workflow-contracts';
import { WorkflowRuntimeService } from '../src/service.ts';
import { RuntimeStore } from '../src/store.ts';

function createRuntimeService(options: {
  connectorInvoke?: () => Promise<Record<string, unknown>>;
  bridgeInvoke?: () => Promise<Record<string, unknown>>;
}) {
  let timestamp = 1_700_100_000_000;
  let idCounter = 0;
  const capturedEvents: WorkflowFormalEvent[] = [];
  const service = new WorkflowRuntimeService({
    store: new RuntimeStore(),
    compatExecutorClient: {
      getExecutorEntry: () => undefined,
      invoke: async () => {
        throw new Error('compat executor should not be used');
      },
      interact: async () => {
        throw new Error('compat executor should not be used');
      },
    },
    connectorRuntimeClient: {
      invoke: async () => {
        if (!options.connectorInvoke) {
          throw new Error('connector runtime should not be used');
        }
        return await options.connectorInvoke();
      },
    },
    externalBridgeClient: {
      getManifest: async () => {
        throw new Error('external bridge manifest should not be used');
      },
      getHealth: async () => {
        throw new Error('external bridge health should not be used');
      },
      invoke: async () => {
        if (!options.bridgeInvoke) {
          throw new Error('external bridge should not be used');
        }
        return await options.bridgeInvoke();
      },
      resume: async () => {
        throw new Error('external bridge resume should not be used');
      },
      cancel: async () => {
        throw new Error('external bridge cancel should not be used');
      },
    },
    now: () => {
      timestamp += 1;
      return timestamp;
    },
    uuid: () => `id-${++idCounter}`,
  });
  (
    service as unknown as {
      enqueueFormalEvents: (
        traceId: string,
        state: unknown,
        events: WorkflowFormalEvent[],
      ) => Promise<void>;
    }
  ).enqueueFormalEvents = async (_traceId, _state, events) => {
    capturedEvents.push(...events);
  };
  return { service, capturedEvents };
}

function buildTemplateBundle(spec: WorkflowTemplateSpec, suffix: string) {
  const timestamp = Date.now();
  return {
    template: {
      workflowId: `workflow-${suffix}`,
      workflowKey: spec.workflowKey,
      name: spec.name,
      compatProviderId: 'sample',
      status: 'active' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    version: {
      templateVersionId: `version-${suffix}`,
      workflowId: `workflow-${suffix}`,
      workflowKey: spec.workflowKey,
      version: 1,
      status: 'published' as const,
      spec,
      createdAt: timestamp,
    },
  };
}

function buildConnectorSpec(): WorkflowTemplateSpec {
  return {
    schemaVersion: 'v1',
    workflowKey: 'receipt-regression-connector',
    name: 'Receipt Regression Connector',
    compatProviderId: 'sample',
    entryNode: 'connector_step',
    nodes: [
      {
        nodeKey: 'connector_step',
        nodeType: 'executor',
        executorId: 'connector-runtime',
        config: {
          actionRef: 'pipeline_start',
        },
        transitions: {
          success: 'finish',
        },
      },
      {
        nodeKey: 'finish',
        nodeType: 'end',
      },
    ],
  };
}

function buildBridgeSpec(): WorkflowTemplateSpec {
  return {
    schemaVersion: 'v1',
    workflowKey: 'receipt-regression-bridge',
    name: 'Receipt Regression Bridge',
    compatProviderId: 'sample',
    entryNode: 'external_step',
    nodes: [
      {
        nodeKey: 'external_step',
        nodeType: 'executor',
        executorId: 'bridge-capability',
        transitions: {
          success: 'finish',
        },
      },
      {
        nodeKey: 'finish',
        nodeType: 'end',
      },
    ],
  };
}

function buildEndOnlySpec(workflowKey: string): WorkflowTemplateSpec {
  return {
    schemaVersion: 'v1',
    workflowKey,
    name: workflowKey,
    compatProviderId: 'sample',
    entryNode: 'finish',
    nodes: [
      {
        nodeKey: 'finish',
        nodeType: 'end',
      },
    ],
  };
}

test('connector callback rejections emit standardized receipt events and honor receiptKey dedupe identity', async () => {
  const { service, capturedEvents } = createRuntimeService({
    connectorInvoke: async () => ({
      schemaVersion: 'v1',
      status: 'accepted',
      externalSessionRef: 'pipeline:receipt-regression',
      publicCallbackKey: 'public-callback-key',
      metadata: {
        connectorActionSessionId: 'connector-session-1',
      },
    }),
  });

  const start = await service.startRun({
    schemaVersion: 'v1',
    traceId: 'trace-connector-start',
    sessionId: 'session-connector',
    userId: 'user-connector',
    agentId: 'agent-connector',
    sourceType: 'manual',
    runtimeMetadata: {
      workspaceId: 'workspace-connector',
    },
    connectorActions: {
      pipeline_start: {
        actionRef: 'pipeline_start',
        actionBindingId: 'action-binding-1',
        connectorBindingId: 'connector-binding-1',
        connectorKey: 'ci_pipeline',
        capabilityId: 'pipeline.start',
        sideEffectClass: 'write',
        executionMode: 'async',
        browserFallbackMode: 'disabled',
        configJson: {},
      },
    },
    ...buildTemplateBundle(buildConnectorSpec(), 'connector-regression'),
  });

  capturedEvents.length = 0;
  const nodeRun = start.run.nodeRuns[0];
  await assert.rejects(
    () => service.handleConnectorCallback({
      schemaVersion: 'v1',
      traceId: 'trace-connector-callback',
      receiptKey: 'ci-action:delivery-42',
      callbackId: 'callback-out-of-order',
      sequence: 2,
      connectorActionSessionId: 'connector-session-1',
      runId: start.run.run.runId,
      nodeRunId: nodeRun.nodeRunId,
      externalSessionRef: 'pipeline:receipt-regression',
      kind: 'checkpoint',
      emittedAt: Date.now(),
      payload: {
        stage: 'late',
      },
    }),
    (error: { status?: number; code?: string }) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, 'CONNECTOR_CALLBACK_OUT_OF_ORDER');
      return true;
    },
  );

  assert.equal(capturedEvents.length, 1);
  assert.equal(capturedEvents[0].kind, 'external.callback.received');
  assert.equal(capturedEvents[0].payload.receiptSourceKind, 'connector_action_callback');
  assert.equal(capturedEvents[0].payload.metadata?.receiptStatus, 'rejected');
  assert.equal(capturedEvents[0].payload.metadata?.receiptKey, 'ci-action:delivery-42');
  assert.equal(capturedEvents[0].payload.metadata?.callbackId, 'callback-out-of-order');
  assert.match(String(capturedEvents[0].payload.metadata?.errorMessage), /out of order/);

  const snapshot = await service.getRun(start.run.run.runId);
  assert.equal(snapshot?.run.metadata?.connectorRuntime?.eventReceipts.length, 1);
  assert.equal(snapshot?.run.metadata?.connectorRuntime?.eventReceipts[0]?.receiptKey, 'ci-action:delivery-42');
  assert.equal(snapshot?.run.metadata?.connectorRuntime?.eventReceipts[0]?.status, 'rejected');
});

test('bridge callback rejections emit standardized receipt events', async () => {
  const { service, capturedEvents } = createRuntimeService({
    bridgeInvoke: async () => ({
      schemaVersion: 'v1',
      status: 'accepted',
      externalSessionRef: 'bridge-session-ref',
    }),
  });

  const start = await service.startRun({
    schemaVersion: 'v1',
    traceId: 'trace-bridge-start',
    sessionId: 'session-bridge',
    userId: 'user-bridge',
    agentId: 'agent-bridge',
    externalRuntime: {
      bridgeId: 'bridge-1',
      workspaceId: 'workspace-bridge',
      name: 'Regression Bridge',
      baseUrl: 'http://bridge.invalid',
      serviceId: 'bridge-service',
      runtimeType: 'external_agent_runtime',
      manifest: {
        schemaVersion: 'v1',
        bridgeVersion: '0.1.0',
        runtimeType: 'external_agent_runtime',
        displayName: 'Regression Bridge',
        callbackMode: 'async_webhook',
        supportsResume: true,
        supportsCancel: true,
        capabilities: [
          {
            capabilityId: 'bridge-capability',
            name: 'Bridge Capability',
            supportsResume: true,
            supportsCancel: true,
            supportsApproval: false,
          },
        ],
      },
      authConfigJson: {},
      callbackConfigJson: {},
      callbackUrl: 'http://runtime.invalid/internal/runtime/bridge-callback',
    },
    ...buildTemplateBundle(buildBridgeSpec(), 'bridge-regression'),
  });

  capturedEvents.length = 0;
  const nodeRun = start.run.nodeRuns[0];
  await assert.rejects(
    () => service.handleBridgeCallback({
      schemaVersion: 'v1',
      traceId: 'trace-bridge-callback',
      callbackId: 'bridge-callback-out-of-order',
      sequence: 2,
      bridgeId: 'bridge-1',
      runId: start.run.run.runId,
      nodeRunId: nodeRun.nodeRunId,
      externalSessionRef: 'bridge-session-ref',
      kind: 'checkpoint',
      emittedAt: Date.now(),
      payload: {
        stage: 'late',
      },
    }),
    (error: { status?: number; code?: string }) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, 'BRIDGE_CALLBACK_OUT_OF_ORDER');
      return true;
    },
  );

  assert.equal(capturedEvents.length, 1);
  assert.equal(capturedEvents[0].kind, 'external.callback.received');
  assert.equal(capturedEvents[0].payload.receiptSourceKind, 'bridge_callback');
  assert.equal(capturedEvents[0].payload.metadata?.receiptStatus, 'rejected');
  assert.equal(capturedEvents[0].payload.metadata?.callbackId, 'bridge-callback-out-of-order');
  assert.match(String(capturedEvents[0].payload.metadata?.errorMessage), /out of order/);
});

test('event subscription receipts require a matching event_subscription run source', async () => {
  const { service, capturedEvents } = createRuntimeService({});
  const manualRun = await service.startRun({
    schemaVersion: 'v1',
    traceId: 'trace-manual-run',
    sessionId: 'session-manual',
    userId: 'user-manual',
    agentId: 'agent-manual',
    sourceType: 'manual',
    ...buildTemplateBundle(buildEndOnlySpec('manual-run'), 'manual-run'),
  });

  await assert.rejects(
    () => service.recordEventSubscriptionReceipt({
      schemaVersion: 'v1',
      traceId: 'trace-manual-receipt',
      receiptKey: 'event-sub:manual-1',
      runId: manualRun.run.run.runId,
      triggerBindingId: 'trigger-binding-1',
      eventSubscriptionId: 'event-subscription-1',
      eventType: 'pipeline.finished',
      status: 'accepted',
      receivedAt: Date.now(),
    }),
    (error: { status?: number; code?: string }) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, 'EVENT_SUBSCRIPTION_RUN_MISMATCH');
      return true;
    },
  );

  const eventSubscriptionRun = await service.startRun({
    schemaVersion: 'v1',
    traceId: 'trace-event-run',
    sessionId: 'session-event',
    userId: 'user-event',
    agentId: 'agent-event',
    sourceType: 'event_subscription',
    sourceRef: 'trigger-binding-1',
    runtimeMetadata: {
      triggerBindingId: 'trigger-binding-1',
    },
    ...buildTemplateBundle(buildEndOnlySpec('event-run'), 'event-run'),
  });

  capturedEvents.length = 0;
  const receiptResponse = await service.recordEventSubscriptionReceipt({
    schemaVersion: 'v1',
    traceId: 'trace-event-receipt',
    receiptKey: 'event-sub:event-1',
    runId: eventSubscriptionRun.run.run.runId,
    triggerBindingId: 'trigger-binding-1',
    eventSubscriptionId: 'event-subscription-1',
    eventType: 'pipeline.finished',
    status: 'accepted',
    receivedAt: Date.now(),
    metadata: {
      dispatchKey: 'event-1',
    },
  });

  assert.equal(receiptResponse.accepted, true);
  assert.equal(receiptResponse.receipt.runId, eventSubscriptionRun.run.run.runId);
  assert.equal(capturedEvents.length, 1);
  assert.equal(capturedEvents[0].kind, 'external.callback.received');
  assert.equal(capturedEvents[0].payload.receiptSourceKind, 'event_subscription');
  assert.equal(capturedEvents[0].payload.metadata?.triggerBindingId, 'trigger-binding-1');
  assert.equal(capturedEvents[0].payload.metadata?.receiptStatus, 'accepted');
});
