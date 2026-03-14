import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowTemplateSpec } from '@baseinterface/workflow-contracts';
import { WorkflowRuntimeService } from '../src/service.ts';
import { RuntimeStore } from '../src/store.ts';

function createRuntimeService(): WorkflowRuntimeService {
  let timestamp = 1_700_000_000_000;
  let idCounter = 0;

  return new WorkflowRuntimeService({
    store: new RuntimeStore(),
    compatExecutorClient: {
      getExecutorEntry: () => undefined,
      invoke: async () => {
        throw new Error('compat executor should not be used by native platform tests');
      },
      interact: async () => {
        throw new Error('compat executor should not be used by native platform tests');
      },
    },
    connectorRuntimeClient: {
      invoke: async () => {
        throw new Error('connector runtime should not be used by native platform tests');
      },
    },
    externalBridgeClient: {
      getManifest: async () => {
        throw new Error('external bridge should not be used by native platform tests');
      },
      getHealth: async () => {
        throw new Error('external bridge should not be used by native platform tests');
      },
      invoke: async () => {
        throw new Error('external bridge should not be used by native platform tests');
      },
      resume: async () => {
        throw new Error('external bridge should not be used by native platform tests');
      },
      cancel: async () => {
        throw new Error('external bridge should not be used by native platform tests');
      },
    },
    now: () => {
      timestamp += 1;
      return timestamp;
    },
    uuid: () => `id-${++idCounter}`,
  });
}

function buildTemplateBundle(spec: WorkflowTemplateSpec, suffix: string) {
  return {
    template: {
      workflowId: `workflow-${suffix}`,
      workflowKey: String(spec.workflowKey),
      name: String(spec.name),
      status: 'active' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    version: {
      templateVersionId: `version-${suffix}`,
      workflowId: `workflow-${suffix}`,
      workflowKey: String(spec.workflowKey),
      version: 1,
      status: 'published' as const,
      spec,
      createdAt: Date.now(),
    },
  };
}

function buildNativeProofSpec(): WorkflowTemplateSpec {
  return {
    schemaVersion: 'v1',
    workflowKey: 'native-proof-workflow',
    name: 'Native Proof Workflow',
    entryNode: 'emit_draft',
    nodes: [
      {
        nodeKey: 'emit_draft',
        nodeType: 'executor',
        executorId: 'platform.emit_artifact',
        config: {
          artifactType: 'NativeDraftArtifact',
          state: 'review_required',
          payloadMode: 'input',
        },
        transitions: {
          success: 'review_gate',
        },
      },
      {
        nodeKey: 'review_gate',
        nodeType: 'approval_gate',
        config: {
          reviewArtifactTypes: ['NativeDraftArtifact'],
        },
        transitions: {
          approved: 'collect_response',
        },
      },
      {
        nodeKey: 'collect_response',
        nodeType: 'executor',
        executorId: 'platform.request_interaction',
        config: {
          prompt: 'Provide confirmation payload',
          answerSchemaJson: {
            type: 'object',
            properties: {
              decision: { type: 'string' },
            },
            required: ['decision'],
          },
          uiSchemaJson: {
            order: ['decision'],
          },
          responseArtifactType: 'InteractionResponseArtifact',
          responseArtifactState: 'validated',
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

function buildFailSpec(): WorkflowTemplateSpec {
  return {
    schemaVersion: 'v1',
    workflowKey: 'native-fail-workflow',
    name: 'Native Fail Workflow',
    entryNode: 'fail_now',
    nodes: [
      {
        nodeKey: 'fail_now',
        nodeType: 'executor',
        executorId: 'platform.fail',
        config: {
          code: 'NATIVE_FAILURE',
          message: 'deterministic failure',
        },
      },
    ],
  };
}

async function startNativeProofRun(service: WorkflowRuntimeService, suffix: string) {
  const bundle = buildTemplateBundle(buildNativeProofSpec(), suffix);
  const response = await service.startRun({
    schemaVersion: 'v1',
    traceId: `trace-${suffix}`,
    sessionId: `session-${suffix}`,
    userId: `user-${suffix}`,
    agentId: `agent-${suffix}`,
    startMode: 'agent',
    template: bundle.template,
    version: bundle.version,
    inputPayload: {
      reviewerActor: {
        actorId: `reviewer-${suffix}`,
      },
      draft: {
        title: `Draft ${suffix}`,
      },
    },
  });
  return response.run;
}

test('native platform workflow completes via approval and interaction identities', async () => {
  const service = createRuntimeService();

  try {
    const run = await startNativeProofRun(service, 'complete');
    assert.equal(run.run.status, 'waiting_approval');
    assert.equal(run.approvals.length, 1);
    assert.equal(run.approvals[0].status, 'pending');
    assert.equal(run.approvals[0].requestedActorId, 'reviewer-complete');
    assert.equal(run.artifacts.length, 1);
    assert.equal(run.artifacts[0].artifactType, 'NativeDraftArtifact');
    assert.equal(run.artifacts[0].state, 'review_required');
    assert.equal(
      (run.artifacts[0].payloadJson as { draft?: { title?: string } }).draft?.title,
      'Draft complete',
    );

    const approvalDecision = await service.decideApproval(run.approvals[0].approvalRequestId, {
      traceId: 'trace-complete-approval',
      userId: 'reviewer-complete',
      decision: 'approved',
      comment: 'approved for native path',
    });
    assert.equal(approvalDecision.approval.status, 'approved');
    assert.equal(approvalDecision.run.run.status, 'waiting_interaction');
    assert.equal(approvalDecision.run.artifacts[0].state, 'published');
    assert.equal(approvalDecision.run.interactionRequests.length, 1);

    const interactionRequest = approvalDecision.run.interactionRequests[0];
    const interactionDetail = await service.getInteractionRequest(interactionRequest.interactionRequestId);
    assert.ok(interactionDetail);
    assert.equal(interactionDetail?.status, 'pending');

    const resumed = await service.resumeRun({
      schemaVersion: 'v1',
      traceId: 'trace-complete-response',
      runId: run.run.runId,
      interactionRequestId: interactionRequest.interactionRequestId,
      payload: {
        decision: 'ship-it',
      },
    });
    assert.equal(resumed.run.run.status, 'completed');
    assert.equal(resumed.run.approvalDecisions.length, 1);
    assert.equal(resumed.run.interactionRequests[0].status, 'answered');
    assert.equal(resumed.run.artifacts.length, 2);
    assert.equal(resumed.run.artifacts[1].artifactType, 'InteractionResponseArtifact');
    assert.deepEqual(resumed.run.artifacts[1].payloadJson.responsePayload, {
      decision: 'ship-it',
    });
  } finally {
    await service.close();
  }
});

test('native platform failure path deterministically marks the run failed', async () => {
  const service = createRuntimeService();

  try {
    const bundle = buildTemplateBundle(buildFailSpec(), 'fail');
    const response = await service.startRun({
      schemaVersion: 'v1',
      traceId: 'trace-fail',
      sessionId: 'session-fail',
      userId: 'user-fail',
      agentId: 'agent-fail',
      startMode: 'agent',
      template: bundle.template,
      version: bundle.version,
    });

    assert.equal(response.run.run.status, 'failed');
    assert.equal(response.run.nodeRuns[0].status, 'failed');
    assert.deepEqual(response.run.run.metadata?.nativeFailure, {
      code: 'NATIVE_FAILURE',
      message: 'deterministic failure',
    });
  } finally {
    await service.close();
  }
});

test('native platform cancel updates authoritative ledger while waiting approval', async () => {
  const service = createRuntimeService();

  try {
    const run = await startNativeProofRun(service, 'cancel-approval');
    const cancelled = await service.cancelRun({
      schemaVersion: 'v1',
      traceId: 'trace-cancel-approval',
      runId: run.run.runId,
      userId: 'owner-cancel-approval',
      reason: 'cancel while waiting approval',
    });

    assert.equal(cancelled.run.run.status, 'cancelled');
    assert.equal(cancelled.run.nodeRuns.at(-1)?.status, 'cancelled');
    assert.equal(cancelled.run.approvals[0].status, 'cancelled');
    assert.equal(cancelled.run.interactionRequests.length, 0);
  } finally {
    await service.close();
  }
});

test('native platform cancel updates authoritative ledger while waiting interaction', async () => {
  const service = createRuntimeService();

  try {
    const run = await startNativeProofRun(service, 'cancel-interaction');
    const approvalDecision = await service.decideApproval(run.approvals[0].approvalRequestId, {
      traceId: 'trace-cancel-interaction-approval',
      userId: 'reviewer-cancel-interaction',
      decision: 'approved',
    });
    const interactionRequest = approvalDecision.run.interactionRequests[0];
    const cancelled = await service.cancelRun({
      schemaVersion: 'v1',
      traceId: 'trace-cancel-interaction',
      runId: run.run.runId,
      userId: 'owner-cancel-interaction',
      reason: 'cancel while waiting interaction',
    });

    assert.equal(cancelled.run.run.status, 'cancelled');
    assert.equal(cancelled.run.nodeRuns.at(-1)?.status, 'cancelled');
    assert.equal(
      cancelled.run.interactionRequests.find(
        (item) => item.interactionRequestId === interactionRequest.interactionRequestId,
      )?.status,
      'cancelled',
    );
  } finally {
    await service.close();
  }
});
