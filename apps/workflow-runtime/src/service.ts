import { Pool } from 'pg';

import type {
  ContextPackage,
  InteractionEvent,
  UserInteraction,
  UnifiedUserInput,
} from '@baseinterface/contracts';
import type { CompatExecutorClient, ExternalBridgeClient } from '@baseinterface/executor-sdk';
import type {
  ActorMembershipRecord,
  ActorProfileRecord,
  AudienceSelectorRecord,
  BridgeCallbackReceiptRecord,
  BridgeInvokeSessionRecord,
  DeliverySpecRecord,
  DeliveryTargetRecord,
  ExternalRuntimeBridgeSnapshot,
  WorkflowApprovalDecisionResponse,
  WorkflowApprovalDetailResponse,
  WorkflowApprovalQueueItem,
  WorkflowApprovalDecisionRecord,
  WorkflowApprovalRequestRecord,
  WorkflowArtifactDetail,
  WorkflowArtifactRecord,
  WorkflowCommandResponse,
  WorkflowCompatActorMembershipSeed,
  WorkflowCompatActorProfileSeed,
  WorkflowCompatAudienceSelectorSeed,
  WorkflowCompatCompletionMetadata,
  WorkflowCompatContextEnvelope,
  WorkflowCompatDeliverySpecSeed,
  WorkflowCompatDeliveryTargetSeed,
  WorkflowCompatArtifactSeed,
  WorkflowFormalEvent,
  WorkflowNodeRunRecord,
  WorkflowNodeSpec,
  WorkflowRunListResponse,
  WorkflowRunRecord,
  WorkflowRunSnapshot,
  WorkflowRunSummary,
  WorkflowRuntimeBridgeCallbackRequest,
  WorkflowRuntimeBridgeCallbackResponse,
  WorkflowRuntimeCancelRunRequest,
  WorkflowRuntimeResumeRunRequest,
  WorkflowRuntimeStartRunRequest,
  WorkflowTemplateSpec,
} from '@baseinterface/workflow-contracts';
import { isWorkflowNodeTerminal, isWorkflowRunTerminal } from '@baseinterface/workflow-contracts';
import { createLogger, serializeError } from '@baseinterface/shared';
import { createRuntimeRepository, type RuntimeRepository } from './runtime-repository';
import type { InternalRunState, RuntimeStore } from './store';

type RuntimeServiceDeps = {
  store: RuntimeStore;
  compatExecutorClient: CompatExecutorClient;
  externalBridgeClient: ExternalBridgeClient;
  databaseUrl?: string;
  now: () => number;
  uuid: () => string;
};

const logger = createLogger({ service: 'workflow-runtime' });

class RuntimeRequestError extends Error {
  readonly status: number;

  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'RuntimeRequestError';
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Array.isArray(value) === false;
}

function getExternalRuntimeSnapshot(value: unknown): ExternalRuntimeBridgeSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.bridgeId !== 'string' || typeof value.baseUrl !== 'string' || typeof value.serviceId !== 'string') {
    return undefined;
  }
  if (typeof value.workspaceId !== 'string' || typeof value.name !== 'string' || typeof value.runtimeType !== 'string') {
    return undefined;
  }
  if (!isRecord(value.manifest) || !isRecord(value.authConfigJson) || !isRecord(value.callbackConfigJson)) {
    return undefined;
  }
  if (typeof value.callbackUrl !== 'string') {
    return undefined;
  }
  return value as ExternalRuntimeBridgeSnapshot;
}

function deriveBridgeDecision(actionId: string): 'approved' | 'rejected' | undefined {
  if (actionId.includes('approve')) return 'approved';
  if (actionId.includes('reject')) return 'rejected';
  return undefined;
}

function isBridgeSessionTerminal(status: BridgeInvokeSessionRecord['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function buildContextPackage(run: WorkflowRunRecord): ContextPackage {
  return {
    schemaVersion: 'v0',
    user: {
      userId: run.userId,
    },
    profileSnapshot: {
      displayName: run.userId,
    },
    profileRef: `profile:${run.userId}`,
    permissions: ['context:read'],
    session: {
      sessionId: run.sessionId,
      recentEventsCursor: 0,
    },
  };
}

function findNode(spec: WorkflowTemplateSpec, nodeKey: string): WorkflowNodeSpec {
  const node = spec.nodes.find((item) => item.nodeKey === nodeKey);
  if (!node) {
    throw new Error(`workflow node not found: ${nodeKey}`);
  }
  return node;
}

function cloneSnapshot(state: InternalRunState): WorkflowRunSnapshot {
  return {
    run: { ...state.run, metadata: state.run.metadata ? { ...state.run.metadata } : undefined },
    nodeRuns: state.nodeRuns.map((item) => ({
      ...item,
      inputJson: item.inputJson ? { ...item.inputJson } : undefined,
      metadata: item.metadata ? { ...item.metadata } : undefined,
    })),
    approvals: state.approvals.map((item) => ({ ...item, payloadJson: item.payloadJson ? { ...item.payloadJson } : undefined })),
    approvalDecisions: state.decisions.map((item) => ({ ...item, payloadJson: item.payloadJson ? { ...item.payloadJson } : undefined })),
    artifacts: state.artifacts.map((item) => ({
      ...item,
      payloadJson: { ...item.payloadJson },
      metadataJson: item.metadataJson ? { ...item.metadataJson } : undefined,
    })),
    actorProfiles: state.actorProfiles.map((item) => ({ ...item, payloadJson: item.payloadJson ? { ...item.payloadJson } : undefined })),
    actorMemberships: state.actorMemberships.map((item) => ({ ...item, payloadJson: item.payloadJson ? { ...item.payloadJson } : undefined })),
    audienceSelectors: state.audienceSelectors.map((item) => ({ ...item, selectorJson: { ...item.selectorJson } })),
    deliverySpecs: state.deliverySpecs.map((item) => ({ ...item, configJson: item.configJson ? { ...item.configJson } : undefined })),
    deliveryTargets: state.deliveryTargets.map((item) => ({ ...item, payloadJson: item.payloadJson ? { ...item.payloadJson } : undefined })),
  };
}

function toArtifactDetail(artifact: WorkflowArtifactRecord): WorkflowArtifactDetail {
  return {
    artifact,
    typedPayload: artifact.payloadJson,
    lineage: (
      artifact.metadataJson
      && typeof artifact.metadataJson.lineage === 'object'
      && artifact.metadataJson.lineage !== null
      && Array.isArray(artifact.metadataJson.lineage) === false
    )
      ? artifact.metadataJson.lineage as Record<string, unknown>
      : {},
  };
}

function buildRunSummary(snapshot: WorkflowRunSnapshot): WorkflowRunSummary {
  const currentNode = snapshot.nodeRuns.find((item) => item.nodeRunId === snapshot.run.currentNodeRunId);
  const deliverySummary = {
    pendingResolution: snapshot.deliveryTargets.filter((item) => item.status === 'pending_resolution').length,
    ready: snapshot.deliveryTargets.filter((item) => item.status === 'ready').length,
    blocked: snapshot.deliveryTargets.filter((item) => item.status === 'blocked').length,
    delivered: snapshot.deliveryTargets.filter((item) => item.status === 'delivered').length,
    failed: snapshot.deliveryTargets.filter((item) => item.status === 'failed').length,
    cancelled: snapshot.deliveryTargets.filter((item) => item.status === 'cancelled').length,
  };
  const blocker = snapshot.run.status === 'waiting_input'
    ? 'waiting_input'
    : snapshot.run.status === 'waiting_approval'
      ? 'waiting_approval'
      : snapshot.run.status === 'failed'
        ? 'failed'
        : snapshot.run.status === 'paused'
          ? 'paused'
          : null;
  return {
    runId: snapshot.run.runId,
    workflowId: snapshot.run.workflowId,
    workflowKey: snapshot.run.workflowKey,
    templateVersionId: snapshot.run.templateVersionId,
    compatProviderId: snapshot.run.compatProviderId,
    status: snapshot.run.status,
    sessionId: snapshot.run.sessionId,
    userId: snapshot.run.userId,
    createdAt: snapshot.run.createdAt,
    updatedAt: snapshot.run.updatedAt,
    completedAt: snapshot.run.completedAt,
    currentNodeRunId: snapshot.run.currentNodeRunId,
    currentNodeKey: currentNode?.nodeKey,
    currentNodeType: currentNode?.nodeType,
    currentNodeStatus: currentNode?.status,
    blocker,
    pendingApprovalCount: snapshot.approvals.filter((item) => item.status === 'pending').length,
    deliverySummary,
    artifactTypes: [...new Set(snapshot.artifacts.map((item) => item.artifactType))],
    requestedActorIds: [...new Set(snapshot.approvals.map((item) => item.requestedActorId).filter(Boolean) as string[])],
  };
}

function buildApprovalQueueItem(
  approval: WorkflowApprovalRequestRecord,
  snapshot: WorkflowRunSnapshot,
): WorkflowApprovalQueueItem {
  const nodeRun = snapshot.nodeRuns.find((item) => item.nodeRunId === approval.nodeRunId);
  const actor = approval.requestedActorId
    ? snapshot.actorProfiles.find((item) => item.actorId === approval.requestedActorId)
    : undefined;
  const payload = isRecord(approval.payloadJson) ? approval.payloadJson : {};
  const artifactIds = Array.isArray(payload.artifactIds)
    ? payload.artifactIds.map((item) => String(item))
    : approval.artifactId
      ? [approval.artifactId]
      : [];
  const artifactTypes = Array.isArray(payload.artifactTypes)
    ? payload.artifactTypes.map((item) => String(item))
    : artifactIds
      .map((artifactId) => snapshot.artifacts.find((artifact) => artifact.artifactId === artifactId)?.artifactType)
      .filter(Boolean) as string[];
  return {
    approvalRequestId: approval.approvalRequestId,
    runId: approval.runId,
    workflowKey: snapshot.run.workflowKey,
    templateVersionId: snapshot.run.templateVersionId,
    compatProviderId: snapshot.run.compatProviderId,
    runStatus: snapshot.run.status,
    nodeRunId: approval.nodeRunId,
    nodeKey: nodeRun?.nodeKey,
    status: approval.status,
    requestedActorId: approval.requestedActorId,
    approverDisplayName: actor?.displayName,
    artifactId: approval.artifactId,
    artifactIds,
    artifactTypes,
    createdAt: approval.createdAt,
    updatedAt: approval.updatedAt,
  };
}

function normalizeCompatArtifacts(value: unknown): WorkflowCompatArtifactSeed[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((item) => typeof item.artifactType === 'string' && isRecord(item.payload))
    .map((item) => ({
      artifactType: String(item.artifactType),
      state: typeof item.state === 'string' ? item.state as WorkflowCompatArtifactSeed['state'] : undefined,
      schemaRef: typeof item.schemaRef === 'string' ? item.schemaRef : undefined,
      payload: item.payload as Record<string, unknown>,
      metadata: isRecord(item.metadata) ? item.metadata : undefined,
    }));
}

function normalizeActorProfiles(value: unknown): WorkflowCompatActorProfileSeed[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((item) => typeof item.actorId === 'string' && typeof item.workspaceId === 'string' && typeof item.displayName === 'string')
    .map((item) => ({
      actorId: String(item.actorId),
      workspaceId: String(item.workspaceId),
      status: String(item.status || 'active') as WorkflowCompatActorProfileSeed['status'],
      displayName: String(item.displayName),
      actorType: String(item.actorType || 'person') as WorkflowCompatActorProfileSeed['actorType'],
      payloadJson: isRecord(item.payloadJson) ? item.payloadJson : undefined,
    }));
}

function normalizeActorMemberships(value: unknown): WorkflowCompatActorMembershipSeed[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((item) => typeof item.actorMembershipId === 'string' && typeof item.fromActorId === 'string' && typeof item.toActorId === 'string')
    .map((item) => ({
      actorMembershipId: String(item.actorMembershipId),
      fromActorId: String(item.fromActorId),
      toActorId: String(item.toActorId),
      relationType: String(item.relationType || 'related_to'),
      status: String(item.status || 'active') as WorkflowCompatActorMembershipSeed['status'],
      confirmedAt: typeof item.confirmedAt === 'number' ? item.confirmedAt : undefined,
      payloadJson: isRecord(item.payloadJson) ? item.payloadJson : undefined,
    }));
}

function normalizeAudienceSelector(value: unknown): WorkflowCompatAudienceSelectorSeed | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.audienceSelectorId !== 'string' || !isRecord(value.selectorJson)) return undefined;
  return {
    audienceSelectorId: String(value.audienceSelectorId),
    status: String(value.status || 'draft') as WorkflowCompatAudienceSelectorSeed['status'],
    selectorJson: value.selectorJson,
  };
}

function normalizeDeliverySpec(value: unknown): WorkflowCompatDeliverySpecSeed | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.deliverySpecId !== 'string' || typeof value.audienceSelectorId !== 'string') return undefined;
  return {
    deliverySpecId: String(value.deliverySpecId),
    audienceSelectorId: String(value.audienceSelectorId),
    reviewRequired: value.reviewRequired !== false,
    deliveryMode: String(value.deliveryMode || 'manual_handoff') as WorkflowCompatDeliverySpecSeed['deliveryMode'],
    status: String(value.status || 'draft') as WorkflowCompatDeliverySpecSeed['status'],
    configJson: isRecord(value.configJson) ? value.configJson : undefined,
  };
}

function normalizeDeliveryTargets(value: unknown): WorkflowCompatDeliveryTargetSeed[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((item) => typeof item.deliveryTargetId === 'string' && typeof item.deliverySpecId === 'string')
    .map((item) => ({
      deliveryTargetId: String(item.deliveryTargetId),
      deliverySpecId: String(item.deliverySpecId),
      targetActorId: typeof item.targetActorId === 'string' ? item.targetActorId : undefined,
      status: String(item.status || 'pending_resolution') as WorkflowCompatDeliveryTargetSeed['status'],
      payloadJson: isRecord(item.payloadJson) ? item.payloadJson : undefined,
    }));
}

function normalizeCompatCompletionMetadata(value: unknown): WorkflowCompatCompletionMetadata {
  if (!isRecord(value)) return {};
  return {
    artifacts: normalizeCompatArtifacts(value.artifacts),
    actorProfiles: normalizeActorProfiles(value.actorProfiles),
    actorMemberships: normalizeActorMemberships(value.actorMemberships),
    audienceSelector: normalizeAudienceSelector(value.audienceSelector),
    deliverySpec: normalizeDeliverySpec(value.deliverySpec),
    deliveryTargets: normalizeDeliveryTargets(value.deliveryTargets),
  };
}

export class WorkflowRuntimeService {
  private readonly store: RuntimeStore;

  private readonly compatExecutorClient: CompatExecutorClient;

  private readonly externalBridgeClient: ExternalBridgeClient;

  private readonly now: () => number;

  private readonly uuid: () => string;

  private readonly outboxPool?: Pool;

  private readonly repository?: RuntimeRepository;

  constructor(deps: RuntimeServiceDeps) {
    this.store = deps.store;
    this.compatExecutorClient = deps.compatExecutorClient;
    this.externalBridgeClient = deps.externalBridgeClient;
    this.now = deps.now;
    this.uuid = deps.uuid;
    if (deps.databaseUrl) {
      this.outboxPool = new Pool({ connectionString: deps.databaseUrl });
      this.repository = createRuntimeRepository(deps.databaseUrl);
    }
  }

  async close(): Promise<void> {
    await this.repository?.close().catch(() => undefined);
    if (this.outboxPool) {
      await this.outboxPool.end();
    }
  }

  async startRun(request: WorkflowRuntimeStartRunRequest): Promise<WorkflowCommandResponse> {
    const timestamp = this.now();
    const runMetadata: Record<string, unknown> = {};
    if (request.inputText) runMetadata.inputText = request.inputText;
    if (request.inputPayload) runMetadata.inputPayload = request.inputPayload;
    if (request.agentId) runMetadata.agentId = request.agentId;
    if (request.sourceType) runMetadata.sourceType = request.sourceType;
    if (request.sourceRef) runMetadata.sourceRef = request.sourceRef;
    if (request.runtimeMetadata) runMetadata.runtimeMetadata = request.runtimeMetadata;
    if (request.externalRuntime) runMetadata.externalRuntime = request.externalRuntime;
    const run: WorkflowRunRecord = {
      runId: this.uuid(),
      workflowId: request.template.workflowId,
      workflowKey: request.template.workflowKey,
      templateVersionId: request.version.templateVersionId,
      compatProviderId: request.template.compatProviderId,
      status: 'created',
      sessionId: request.sessionId,
      userId: request.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: Object.keys(runMetadata).length > 0 ? runMetadata : undefined,
    };

    const state = this.store.createRun({
      template: request.template,
      version: request.version,
      run,
      nodeRuns: [],
      approvals: [],
      decisions: [],
      artifacts: [],
      actorProfiles: [],
      actorMemberships: [],
      audienceSelectors: [],
      deliverySpecs: [],
      deliveryTargets: [],
      bridgeInvokeSessions: [],
      bridgeCallbackReceipts: [],
    });

    const events = await this.advanceToNode(
      state,
      request.version.spec.entryNode,
      request.traceId,
      {
        text: request.inputText,
        payload: request.inputPayload,
      },
      new Set<string>(),
      false,
    );
    await this.persistState(state);
    await this.enqueueFormalEvents(request.traceId, state, events);
    return {
      schemaVersion: 'v1',
      run: cloneSnapshot(state),
      events,
    };
  }

  async resumeRun(request: WorkflowRuntimeResumeRunRequest): Promise<WorkflowCommandResponse> {
    const state = await this.requireRunState(request.runId);
    const current = state.nodeRuns.find((item) => item.nodeRunId === state.run.currentNodeRunId);
    if (!current) {
      throw new Error(`workflow run missing current node: ${request.runId}`);
    }

    let events: WorkflowFormalEvent[] = [];
    if (current.nodeType === 'approval_gate') {
      events = await this.resumeApprovalGate(state, current, request.traceId, request.actionId);
    } else {
      events = await this.resumeExecutorNode(state, current, request.traceId, request);
    }

    await this.persistState(state);
    await this.enqueueFormalEvents(request.traceId, state, events);
    return {
      schemaVersion: 'v1',
      run: cloneSnapshot(state),
      events,
    };
  }

  async cancelRun(request: WorkflowRuntimeCancelRunRequest): Promise<WorkflowCommandResponse> {
    const state = await this.requireRunState(request.runId);
    if (isWorkflowRunTerminal(state.run.status)) {
      throw new RuntimeRequestError(409, 'RUN_ALREADY_TERMINAL', `workflow run is already terminal: ${request.runId}`);
    }

    const bridge = this.requireExternalRuntimeBridge(state);
    const currentNode = state.nodeRuns.find((item) => item.nodeRunId === state.run.currentNodeRunId);
    if (!currentNode) {
      throw new RuntimeRequestError(409, 'RUN_CURRENT_NODE_MISSING', `workflow run missing current node: ${request.runId}`);
    }
    const bridgeSession = currentNode.nodeType === 'executor'
      ? this.findBridgeInvokeSession(state, {
          bridgeId: bridge.bridgeId,
          nodeRunId: currentNode.nodeRunId,
        })
      : undefined;

    if (currentNode.nodeType === 'executor') {
      if (!bridgeSession) {
        throw new RuntimeRequestError(409, 'BRIDGE_SESSION_NOT_FOUND', 'external-runtime run has no active bridge session');
      }
      if (isBridgeSessionTerminal(bridgeSession.status)) {
        throw new RuntimeRequestError(409, 'BRIDGE_SESSION_TERMINAL', 'bridge session is already terminal');
      }

      try {
        await this.externalBridgeClient.cancel(bridge, {
          schemaVersion: 'v1',
          traceId: request.traceId,
          bridgeId: bridge.bridgeId,
          bridgeSessionId: bridgeSession.bridgeSessionId,
          runId: state.run.runId,
          nodeRunId: bridgeSession.nodeRunId,
          externalSessionRef: bridgeSession.externalSessionRef,
          reason: request.reason,
          metadata: {
            cancelledBy: request.userId,
          },
        });
      } catch (error) {
        throw new RuntimeRequestError(
          502,
          'BRIDGE_CANCEL_FAILED',
          error instanceof Error ? error.message : 'bridge cancel failed',
        );
      }
    } else if (currentNode.nodeType !== 'approval_gate') {
      throw new RuntimeRequestError(
        409,
        'RUN_CANCEL_UNSUPPORTED',
        `external-runtime run cannot be cancelled from node type ${currentNode.nodeType}`,
      );
    }

    const events = this.applyRunCancellation(state, currentNode, request.traceId, request.userId, request.reason, bridgeSession);
    await this.persistState(state);
    await this.enqueueFormalEvents(request.traceId, state, events);
    return {
      schemaVersion: 'v1',
      run: cloneSnapshot(state),
      events,
    };
  }

  async handleBridgeCallback(
    request: WorkflowRuntimeBridgeCallbackRequest,
  ): Promise<WorkflowRuntimeBridgeCallbackResponse> {
    const state = await this.requireRunState(request.runId);
    const bridge = this.requireExternalRuntimeBridge(state);
    if (bridge.bridgeId !== request.bridgeId) {
      throw new RuntimeRequestError(409, 'BRIDGE_MISMATCH', 'callback bridgeId does not match the run external runtime');
    }

    const bridgeSession = this.findBridgeInvokeSession(state, {
      bridgeId: request.bridgeId,
      nodeRunId: request.nodeRunId,
      externalSessionRef: request.externalSessionRef,
    });
    if (!bridgeSession) {
      throw new RuntimeRequestError(404, 'BRIDGE_SESSION_NOT_FOUND', 'bridge session not found for callback');
    }

    const timestamp = this.now();
    const duplicateReceipt = state.bridgeCallbackReceipts.find((item) => item.callbackId === request.callbackId);
    if (duplicateReceipt) {
      return {
        schemaVersion: 'v1',
        accepted: true,
        duplicate: true,
        receipt: { ...duplicateReceipt },
      };
    }

    const receipt = this.createBridgeCallbackReceipt(state, {
      callbackReceiptId: this.uuid(),
      callbackId: request.callbackId,
      bridgeSessionId: bridgeSession.bridgeSessionId,
      sequence: request.sequence,
      kind: request.kind,
      status: 'accepted',
      receivedAt: timestamp,
    });

    if (isBridgeSessionTerminal(bridgeSession.status)) {
      receipt.status = 'rejected';
      receipt.errorMessage = 'bridge session is already terminal';
      await this.persistState(state);
      throw new RuntimeRequestError(409, 'BRIDGE_SESSION_TERMINAL', receipt.errorMessage);
    }

    if (request.sequence !== bridgeSession.lastSequence + 1) {
      receipt.status = 'rejected';
      receipt.errorMessage = `callback sequence out of order: expected ${bridgeSession.lastSequence + 1}, got ${request.sequence}`;
      await this.persistState(state);
      throw new RuntimeRequestError(409, 'BRIDGE_CALLBACK_OUT_OF_ORDER', receipt.errorMessage);
    }

    const previousSequence = bridgeSession.lastSequence;
    bridgeSession.lastSequence = request.sequence;
    bridgeSession.updatedAt = timestamp;
    let events: WorkflowFormalEvent[];
    try {
      events = await this.applyBridgeCallback(state, bridgeSession, request);
    } catch (error) {
      bridgeSession.lastSequence = previousSequence;
      receipt.status = 'rejected';
      receipt.errorMessage = error instanceof Error ? error.message : 'bridge callback rejected';
      await this.persistState(state);
      throw error;
    }
    await this.persistState(state);
    await this.enqueueFormalEvents(request.traceId, state, events);
    return {
      schemaVersion: 'v1',
      accepted: true,
      receipt: { ...receipt },
    };
  }

  async listRunSummaries(limit = 25): Promise<WorkflowRunListResponse> {
    const states = this.repository
      ? await this.repository.listRunStates(limit)
      : this.store.listRuns(limit);
    states.forEach((state) => {
      this.store.saveRun(state);
    });
    return {
      schemaVersion: 'v1',
      runs: states.map((state) => buildRunSummary(cloneSnapshot(state))),
    };
  }

  async listApprovals(): Promise<WorkflowApprovalRequestRecord[]> {
    if (this.repository) {
      return await this.repository.listApprovals();
    }
    return this.store.listApprovals();
  }

  async listApprovalQueue(): Promise<WorkflowApprovalQueueItem[]> {
    const approvals = await this.listApprovals();
    const runCache = new Map<string, WorkflowRunSnapshot>();
    const queue: WorkflowApprovalQueueItem[] = [];

    for (const approval of approvals) {
      let snapshot = runCache.get(approval.runId);
      if (!snapshot) {
        snapshot = await this.getRun(approval.runId);
        if (!snapshot) {
          continue;
        }
        runCache.set(approval.runId, snapshot);
      }
      queue.push(buildApprovalQueueItem(approval, snapshot));
    }

    return queue.sort((a, b) => {
      if (a.status === b.status) {
        return b.updatedAt - a.updatedAt;
      }
      if (a.status === 'pending') return -1;
      if (b.status === 'pending') return 1;
      return b.updatedAt - a.updatedAt;
    });
  }

  async getApprovalDetail(approvalRequestId: string): Promise<WorkflowApprovalDetailResponse | undefined> {
    const approval = await this.getApprovalRecord(approvalRequestId);
    if (!approval) {
      return undefined;
    }
    const snapshot = await this.getRun(approval.runId);
    if (!snapshot) {
      return undefined;
    }
    const payload = isRecord(approval.payloadJson) ? approval.payloadJson : {};
    const artifactIds = Array.isArray(payload.artifactIds)
      ? payload.artifactIds.map((item) => String(item))
      : approval.artifactId
        ? [approval.artifactId]
        : [];
    const artifacts = artifactIds.length > 0
      ? snapshot.artifacts.filter((artifact) => artifactIds.includes(artifact.artifactId))
      : snapshot.artifacts.filter((artifact) => artifact.artifactId === approval.artifactId);
    return {
      schemaVersion: 'v1',
      approval,
      runSummary: buildRunSummary(snapshot),
      approverContext: approval.requestedActorId
        ? snapshot.actorProfiles.find((item) => item.actorId === approval.requestedActorId)
        : undefined,
      artifacts: artifacts.map((artifact) => toArtifactDetail(artifact)),
      decisions: snapshot.approvalDecisions.filter((item) => item.approvalRequestId === approvalRequestId),
    };
  }

  async decideApproval(
    approvalRequestId: string,
    request: {
      traceId: string;
      userId: string;
      decision: 'approved' | 'rejected';
      comment?: string;
    },
  ): Promise<WorkflowApprovalDecisionResponse> {
    const approval = await this.getApprovalRecord(approvalRequestId);
    if (!approval) {
      throw new RuntimeRequestError(404, 'APPROVAL_NOT_FOUND', `approval request not found: ${approvalRequestId}`);
    }
    if (approval.status !== 'pending') {
      throw new RuntimeRequestError(409, 'APPROVAL_NOT_PENDING', `approval request is not pending: ${approvalRequestId}`);
    }

    const state = await this.requireRunState(approval.runId);
    const nodeRun = state.nodeRuns.find((item) => item.nodeRunId === approval.nodeRunId);
    if (!nodeRun) {
      throw new RuntimeRequestError(409, 'APPROVAL_NODE_NOT_FOUND', `approval node not found for request: ${approvalRequestId}`);
    }
    const bridgeSession = this.findBridgeInvokeSession(state, {
      nodeRunId: nodeRun.nodeRunId,
    });
    const events = this.getExternalRuntimeBridge(state) && nodeRun.nodeType === 'executor' && bridgeSession
      ? await this.applyBridgeApprovalDecision(
          state,
          nodeRun,
          request.traceId,
          request.decision === 'approved',
          request.userId,
          request.comment,
        )
      : await this.applyApprovalDecision(
          state,
          nodeRun,
          request.traceId,
          request.decision === 'approved',
          request.userId,
          request.comment,
        );
    await this.persistState(state);
    await this.enqueueFormalEvents(request.traceId, state, events);

    const nextApproval = state.approvals.find((item) => item.approvalRequestId === approvalRequestId);
    const decision = [...state.decisions]
      .reverse()
      .find((item) => item.approvalRequestId === approvalRequestId);
    if (!nextApproval || !decision) {
      throw new Error(`approval decision persistence failed: ${approvalRequestId}`);
    }

    return {
      schemaVersion: 'v1',
      approval: { ...nextApproval, payloadJson: nextApproval.payloadJson ? { ...nextApproval.payloadJson } : undefined },
      decision: { ...decision, payloadJson: decision.payloadJson ? { ...decision.payloadJson } : undefined },
      run: cloneSnapshot(state),
      events,
    };
  }

  async getArtifact(artifactId: string): Promise<WorkflowArtifactRecord | undefined> {
    const inMemory = this.store.getArtifact(artifactId);
    if (inMemory) return inMemory;
    return await this.repository?.getArtifact(artifactId);
  }

  async getRun(runId: string): Promise<WorkflowRunSnapshot | undefined> {
    const inMemory = this.store.snapshot(runId);
    if (inMemory) return inMemory;
    const loaded = await this.repository?.loadRunState(runId);
    if (!loaded) return undefined;
    this.store.createRun(loaded);
    return cloneSnapshot(loaded);
  }

  private async requireRunState(runId: string): Promise<InternalRunState> {
    const existing = this.store.getRun(runId);
    if (existing) return existing;
    const loaded = await this.repository?.loadRunState(runId);
    if (!loaded) {
      throw new RuntimeRequestError(404, 'RUN_NOT_FOUND', `workflow run not found: ${runId}`);
    }
    this.store.createRun(loaded);
    return loaded;
  }

  private async getApprovalRecord(approvalRequestId: string): Promise<WorkflowApprovalRequestRecord | undefined> {
    const inMemory = this.store.getApproval(approvalRequestId);
    if (inMemory) {
      return inMemory;
    }
    return await this.repository?.getApproval(approvalRequestId);
  }

  private async persistState(state: InternalRunState): Promise<void> {
    this.store.saveRun(state);
    await this.repository?.saveState(state);
  }

  private getRunInputPayload(state: InternalRunState): Record<string, unknown> | undefined {
    if (isRecord(state.run.metadata?.inputPayload)) {
      return state.run.metadata?.inputPayload as Record<string, unknown>;
    }
    const firstInput = state.nodeRuns.find((item) => item.inputJson && Object.keys(item.inputJson).length > 0)?.inputJson;
    return isRecord(firstInput) ? firstInput : undefined;
  }

  private buildWorkflowEnvelope(state: InternalRunState, node: WorkflowNodeSpec): WorkflowCompatContextEnvelope {
    return {
      nodeKey: node.nodeKey,
      nodeType: node.nodeType,
      nodeConfig: isRecord(node.config) ? node.config : undefined,
      runInput: this.getRunInputPayload(state),
      upstreamArtifactRefs: state.artifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        artifactType: artifact.artifactType,
        state: artifact.state,
      })),
    };
  }

  private async advanceToNode(
    state: InternalRunState,
    nodeKey: string,
    traceId: string,
    initialInput: { text?: string; payload?: Record<string, unknown> },
    visited: Set<string>,
    fromResume: boolean,
  ): Promise<WorkflowFormalEvent[]> {
    if (visited.has(nodeKey)) {
      state.run.status = 'failed';
      state.run.updatedAt = this.now();
      return [this.buildRunStateEvent(traceId, state.run, 'failed')];
    }
    visited.add(nodeKey);

    const node = findNode(state.version.spec, nodeKey);
    const now = this.now();
    const nodeRun: WorkflowNodeRunRecord = {
      nodeRunId: this.uuid(),
      runId: state.run.runId,
      nodeKey,
      nodeType: node.nodeType,
      status: 'running',
      executorId: node.executorId,
      attempt: 1,
      inputJson: initialInput.payload || (initialInput.text ? { text: initialInput.text } : undefined),
      createdAt: now,
      updatedAt: now,
    };
    state.nodeRuns.push(nodeRun);
    state.run.currentNodeRunId = nodeRun.nodeRunId;
    state.run.status = 'running';
    state.run.updatedAt = now;

    const events: WorkflowFormalEvent[] = [
      this.buildRunStateEvent(traceId, state.run, 'running'),
      this.buildNodeStateEvent(traceId, state.run, nodeRun, 'running'),
    ];

    if (node.nodeType === 'end') {
      nodeRun.status = 'completed';
      nodeRun.updatedAt = this.now();
      state.run.status = 'completed';
      state.run.updatedAt = this.now();
      state.run.completedAt = this.now();
      events.push(this.buildNodeStateEvent(traceId, state.run, nodeRun, 'completed'));
      events.push(this.buildRunStateEvent(traceId, state.run, 'completed'));
      return events;
    }

    if (node.nodeType === 'approval_gate') {
      const approval = this.createApprovalRequest(state, nodeRun, node);
      nodeRun.status = 'waiting_approval';
      nodeRun.updatedAt = this.now();
      state.run.status = 'waiting_approval';
      state.run.updatedAt = this.now();
      events.push(this.buildNodeStateEvent(traceId, state.run, nodeRun, 'waiting_approval'));
      events.push(this.buildRunStateEvent(traceId, state.run, 'waiting_approval'));
      events.push({
        schemaVersion: 'v1',
        eventId: this.uuid(),
        traceId,
        runId: state.run.runId,
        compatProviderId: state.run.compatProviderId,
        timestampMs: this.now(),
        kind: 'approval_requested',
        payload: {
          approvalRequestId: approval.approvalRequestId,
          nodeRunId: nodeRun.nodeRunId,
          taskId: approval.approvalRequestId,
          prompt: '等待审批后继续执行。',
        },
      });
      return events;
    }

    const externalRuntime = this.getExternalRuntimeBridge(state);
    if (externalRuntime) {
      if (fromResume) {
        return events;
      }
      const bridgeEvents = await this.invokeExternalBridge(
        state,
        nodeRun,
        node,
        traceId,
        externalRuntime,
        initialInput.text,
        initialInput.payload,
      );
      return [...events, ...bridgeEvents];
    }

    const compatEvents = fromResume
      ? []
      : await this.invokeExecutor(state, node, traceId, initialInput.text, initialInput.payload);
    if (fromResume) {
      return events;
    }
    const translated = await this.consumeCompatEvents(state, nodeRun, traceId, compatEvents, visited);
    return [...events, ...translated];
  }

  private async resumeApprovalGate(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    traceId: string,
    actionId: string,
  ): Promise<WorkflowFormalEvent[]> {
    return await this.applyApprovalDecision(
      state,
      nodeRun,
      traceId,
      actionId.includes('approve'),
      state.run.userId,
    );
  }

  private async applyApprovalDecision(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    traceId: string,
    approved: boolean,
    decidedActorId: string,
    comment?: string,
  ): Promise<WorkflowFormalEvent[]> {
    const approval = state.approvals.find((item) => item.nodeRunId === nodeRun.nodeRunId && item.status === 'pending');
    if (!approval) {
      throw new RuntimeRequestError(404, 'APPROVAL_NOT_FOUND', `approval request not found for node ${nodeRun.nodeRunId}`);
    }

    const decision: WorkflowApprovalDecisionRecord = {
      approvalDecisionId: this.uuid(),
      approvalRequestId: approval.approvalRequestId,
      decision: approved ? 'approved' : 'rejected',
      decidedActorId,
      comment,
      createdAt: this.now(),
    };
    state.decisions.push(decision);
    approval.status = decision.decision;
    approval.updatedAt = this.now();

    if (approved) {
      const reviewArtifactIds = Array.isArray(approval.payloadJson?.artifactIds)
        ? approval.payloadJson?.artifactIds.map((item) => String(item))
        : approval.artifactId
          ? [approval.artifactId]
          : [];
      for (const artifact of state.artifacts) {
        if (reviewArtifactIds.includes(artifact.artifactId) && artifact.artifactType === 'AssessmentDraft' && artifact.state === 'review_required') {
          artifact.state = 'published';
          artifact.updatedAt = this.now();
        }
      }
    }

    const events: WorkflowFormalEvent[] = [
      {
        schemaVersion: 'v1',
        eventId: this.uuid(),
        traceId,
        runId: state.run.runId,
        compatProviderId: state.run.compatProviderId,
        timestampMs: this.now(),
        kind: 'approval_decided',
        payload: {
          approvalRequestId: approval.approvalRequestId,
          decision: decision.decision,
        },
      },
    ];

    if (!approved) {
      nodeRun.status = 'failed';
      nodeRun.updatedAt = this.now();
      state.run.status = 'failed';
      state.run.updatedAt = this.now();
      events.push(this.buildNodeStateEvent(traceId, state.run, nodeRun, 'failed'));
      events.push(this.buildRunStateEvent(traceId, state.run, 'failed'));
      return events;
    }

    nodeRun.status = 'completed';
    nodeRun.updatedAt = this.now();
    events.push(this.buildNodeStateEvent(traceId, state.run, nodeRun, 'completed'));
    const nextNode = findNode(state.version.spec, nodeRun.nodeKey).transitions?.approved
      || findNode(state.version.spec, nodeRun.nodeKey).transitions?.success;
    if (!nextNode) {
      state.run.status = 'completed';
      state.run.updatedAt = this.now();
      state.run.completedAt = this.now();
      events.push(this.buildRunStateEvent(traceId, state.run, 'completed'));
      return events;
    }
    const tail = await this.advanceToNode(state, nextNode, traceId, {}, new Set<string>([nodeRun.nodeKey]), false);
    return [...events, ...tail];
  }

  private async resumeExecutorNode(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    traceId: string,
    request: WorkflowRuntimeResumeRunRequest,
  ): Promise<WorkflowFormalEvent[]> {
    if (this.getExternalRuntimeBridge(state)) {
      nodeRun.attempt += 1;
      return await this.resumeExternalBridgeNode(state, nodeRun, traceId, request);
    }
    const node = findNode(state.version.spec, nodeRun.nodeKey);
    const compatEvents = await this.interactExecutor(state, nodeRun, node, traceId, request);
    nodeRun.attempt += 1;
    nodeRun.updatedAt = this.now();
    return this.consumeCompatEvents(state, nodeRun, traceId, compatEvents, new Set<string>([nodeRun.nodeKey]));
  }

  private getExternalRuntimeBridge(state: InternalRunState): ExternalRuntimeBridgeSnapshot | undefined {
    return getExternalRuntimeSnapshot(state.run.metadata?.externalRuntime);
  }

  private requireExternalRuntimeBridge(state: InternalRunState): ExternalRuntimeBridgeSnapshot {
    const bridge = this.getExternalRuntimeBridge(state);
    if (!bridge) {
      throw new RuntimeRequestError(409, 'RUN_CANCEL_UNSUPPORTED', 'run is not bound to an external runtime bridge');
    }
    return bridge;
  }

  private requireAgentId(state: InternalRunState): string {
    const agentId = typeof state.run.metadata?.agentId === 'string'
      ? state.run.metadata.agentId
      : undefined;
    if (!agentId) {
      throw new RuntimeRequestError(409, 'AGENT_ID_REQUIRED', 'external-runtime run is missing agentId');
    }
    return agentId;
  }

  private findBridgeInvokeSession(
    state: InternalRunState,
    params: {
      bridgeId?: string;
      nodeRunId?: string;
      externalSessionRef?: string;
    },
  ): BridgeInvokeSessionRecord | undefined {
    return [...state.bridgeInvokeSessions]
      .reverse()
      .find((item) => (
        (!params.bridgeId || item.bridgeId === params.bridgeId)
        && (!params.nodeRunId || item.nodeRunId === params.nodeRunId)
        && (!params.externalSessionRef || item.externalSessionRef === params.externalSessionRef)
      ));
  }

  private createBridgeCallbackReceipt(
    state: InternalRunState,
    record: BridgeCallbackReceiptRecord,
  ): BridgeCallbackReceiptRecord {
    state.bridgeCallbackReceipts.push(record);
    return record;
  }

  private applyRunCancellation(
    state: InternalRunState,
    currentNode: WorkflowNodeRunRecord,
    traceId: string,
    userId: string,
    reason?: string,
    bridgeSession?: BridgeInvokeSessionRecord,
  ): WorkflowFormalEvent[] {
    const timestamp = this.now();
    if (bridgeSession) {
      bridgeSession.status = 'cancelled';
      bridgeSession.cancelledAt = timestamp;
      bridgeSession.updatedAt = timestamp;
    }
    currentNode.status = 'cancelled';
    currentNode.updatedAt = timestamp;
    currentNode.metadata = {
      ...(currentNode.metadata || {}),
      cancelledBy: userId,
      cancelReason: reason,
    };
    this.cancelPendingApprovals(state);
    state.run.status = 'cancelled';
    state.run.updatedAt = timestamp;
    state.run.completedAt = timestamp;
    return [
      this.buildNodeStateEvent(traceId, state.run, currentNode, 'cancelled'),
      this.buildRunStateEvent(traceId, state.run, 'cancelled'),
    ];
  }

  private cancelPendingApprovals(state: InternalRunState, nodeRunId?: string): void {
    const timestamp = this.now();
    for (const approval of state.approvals) {
      if (approval.status !== 'pending') continue;
      if (nodeRunId && approval.nodeRunId !== nodeRunId) continue;
      approval.status = 'cancelled';
      approval.updatedAt = timestamp;
    }
  }

  private async invokeExternalBridge(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    node: WorkflowNodeSpec,
    traceId: string,
    bridge: ExternalRuntimeBridgeSnapshot,
    inputText?: string,
    inputPayload?: Record<string, unknown>,
  ): Promise<WorkflowFormalEvent[]> {
    const agentId = this.requireAgentId(state);
    const timestamp = this.now();
    try {
      const response = await this.externalBridgeClient.invoke(bridge, {
        schemaVersion: 'v1',
        traceId,
        bridgeId: bridge.bridgeId,
        agentId,
        runId: state.run.runId,
        nodeRunId: nodeRun.nodeRunId,
        workflowKey: state.run.workflowKey,
        sessionId: state.run.sessionId,
        userId: state.run.userId,
        workspaceId: bridge.workspaceId,
        capabilityRef: node.executorId,
        inputText,
        inputPayload,
        context: this.buildWorkflowEnvelope(state, node),
        callback: {
          url: bridge.callbackUrl,
        },
        metadata: {
          sourceType: typeof state.run.metadata?.sourceType === 'string' ? state.run.metadata.sourceType : undefined,
          sourceRef: typeof state.run.metadata?.sourceRef === 'string' ? state.run.metadata.sourceRef : undefined,
          runtimeMetadata: isRecord(state.run.metadata?.runtimeMetadata)
            ? state.run.metadata.runtimeMetadata as Record<string, unknown>
            : undefined,
        },
      });
      const bridgeSession: BridgeInvokeSessionRecord = {
        bridgeSessionId: this.uuid(),
        runId: state.run.runId,
        nodeRunId: nodeRun.nodeRunId,
        bridgeId: bridge.bridgeId,
        externalSessionRef: response.externalSessionRef,
        status: 'running',
        lastSequence: 0,
        metadataJson: isRecord(response.metadata)
          ? { ...response.metadata, capabilityRef: node.executorId }
          : node.executorId
            ? { capabilityRef: node.executorId }
            : undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.bridgeInvokeSessions.push(bridgeSession);
      nodeRun.metadata = {
        ...(nodeRun.metadata || {}),
        bridgeId: bridge.bridgeId,
        bridgeSessionId: bridgeSession.bridgeSessionId,
        externalSessionRef: bridgeSession.externalSessionRef,
      };
      nodeRun.updatedAt = timestamp;
      return [];
    } catch (error) {
      nodeRun.status = 'failed';
      nodeRun.updatedAt = timestamp;
      nodeRun.metadata = {
        ...(nodeRun.metadata || {}),
        bridgeError: serializeError(error),
      };
      state.run.status = 'failed';
      state.run.updatedAt = timestamp;
      return [
        this.buildNodeStateEvent(traceId, state.run, nodeRun, 'failed'),
        this.buildRunStateEvent(traceId, state.run, 'failed'),
      ];
    }
  }

  private async resumeExternalBridgeNode(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    traceId: string,
    request: WorkflowRuntimeResumeRunRequest,
  ): Promise<WorkflowFormalEvent[]> {
    const decision = deriveBridgeDecision(request.actionId);
    if (!decision) {
      throw new RuntimeRequestError(409, 'BRIDGE_RESUME_ACTION_INVALID', 'external bridge resume requires approve/reject action');
    }
    return await this.applyBridgeApprovalDecision(
      state,
      nodeRun,
      traceId,
      decision === 'approved',
      request.userId,
    );
  }

  private async applyBridgeApprovalDecision(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    traceId: string,
    approved: boolean,
    decidedActorId: string,
    comment?: string,
  ): Promise<WorkflowFormalEvent[]> {
    const approval = state.approvals.find((item) => item.nodeRunId === nodeRun.nodeRunId && item.status === 'pending');
    if (!approval) {
      throw new RuntimeRequestError(404, 'APPROVAL_NOT_FOUND', `approval request not found for node ${nodeRun.nodeRunId}`);
    }
    const bridge = this.requireExternalRuntimeBridge(state);
    const bridgeSession = this.findBridgeInvokeSession(state, {
      bridgeId: bridge.bridgeId,
      nodeRunId: nodeRun.nodeRunId,
    });
    if (!bridgeSession) {
      throw new RuntimeRequestError(409, 'BRIDGE_SESSION_NOT_FOUND', 'approval node is missing bridge session');
    }
    if (bridgeSession.status !== 'waiting_approval') {
      throw new RuntimeRequestError(409, 'BRIDGE_SESSION_NOT_WAITING_APPROVAL', 'bridge session is not waiting approval');
    }

    try {
      const response = await this.externalBridgeClient.resume(bridge, {
        schemaVersion: 'v1',
        traceId,
        bridgeId: bridge.bridgeId,
        bridgeSessionId: bridgeSession.bridgeSessionId,
        agentId: this.requireAgentId(state),
        runId: state.run.runId,
        nodeRunId: nodeRun.nodeRunId,
        externalSessionRef: bridgeSession.externalSessionRef,
        sessionId: state.run.sessionId,
        userId: state.run.userId,
        workspaceId: bridge.workspaceId,
        resumeToken: bridgeSession.resumeToken,
        payload: {
          approvalRequestId: approval.approvalRequestId,
        },
        decision: approved ? 'approved' : 'rejected',
        comment,
        callback: {
          url: bridge.callbackUrl,
        },
        metadata: {
          decidedActorId,
          comment,
        },
      });
      bridgeSession.externalSessionRef = response.externalSessionRef;
    } catch (error) {
      throw new RuntimeRequestError(
        502,
        'BRIDGE_RESUME_FAILED',
        error instanceof Error ? error.message : 'bridge resume failed',
      );
    }

    const timestamp = this.now();
    const decision: WorkflowApprovalDecisionRecord = {
      approvalDecisionId: this.uuid(),
      approvalRequestId: approval.approvalRequestId,
      decision: approved ? 'approved' : 'rejected',
      decidedActorId,
      comment,
      payloadJson: {
        bridgeSessionId: bridgeSession.bridgeSessionId,
        externalSessionRef: bridgeSession.externalSessionRef,
      },
      createdAt: timestamp,
    };
    state.decisions.push(decision);
    approval.status = decision.decision;
    approval.updatedAt = timestamp;
    bridgeSession.status = 'running';
    bridgeSession.resumeToken = undefined;
    bridgeSession.updatedAt = timestamp;
    nodeRun.status = 'running';
    nodeRun.updatedAt = timestamp;
    state.run.status = 'running';
    state.run.updatedAt = timestamp;

    return [
      {
        schemaVersion: 'v1',
        eventId: this.uuid(),
        traceId,
        runId: state.run.runId,
        compatProviderId: state.run.compatProviderId,
        timestampMs: timestamp,
        kind: 'approval_decided',
        payload: {
          approvalRequestId: approval.approvalRequestId,
          decision: decision.decision,
        },
      },
      this.buildNodeStateEvent(traceId, state.run, nodeRun, 'running'),
      this.buildRunStateEvent(traceId, state.run, 'running'),
    ];
  }

  private async applyBridgeCallback(
    state: InternalRunState,
    bridgeSession: BridgeInvokeSessionRecord,
    request: WorkflowRuntimeBridgeCallbackRequest,
  ): Promise<WorkflowFormalEvent[]> {
    const nodeRun = state.nodeRuns.find((item) => item.nodeRunId === bridgeSession.nodeRunId);
    if (!nodeRun) {
      throw new RuntimeRequestError(409, 'NODE_RUN_NOT_FOUND', 'bridge callback node run not found');
    }
    const node = findNode(state.version.spec, nodeRun.nodeKey);
    const payload = isRecord(request.payload) ? request.payload : {};
    const timestamp = this.now();

    if (request.kind === 'checkpoint') {
      bridgeSession.metadataJson = {
        ...(bridgeSession.metadataJson || {}),
        lastCheckpoint: payload,
        lastCheckpointAt: request.emittedAt,
      };
      bridgeSession.updatedAt = timestamp;
      return [{
        schemaVersion: 'v1',
        eventId: this.uuid(),
        traceId: request.traceId,
        runId: state.run.runId,
        compatProviderId: state.run.compatProviderId,
        timestampMs: timestamp,
        kind: 'checkpoint',
        payload: {
          nodeRunId: nodeRun.nodeRunId,
          nodeKey: nodeRun.nodeKey,
          sequence: request.sequence,
          externalSessionRef: bridgeSession.externalSessionRef,
          metadata: payload,
        },
      }];
    }

    if (request.kind === 'approval_requested') {
      const existingApproval = state.approvals.find((item) => item.nodeRunId === nodeRun.nodeRunId && item.status === 'pending');
      if (existingApproval) {
        throw new RuntimeRequestError(409, 'APPROVAL_ALREADY_PENDING', 'bridge node already has a pending approval');
      }
      const approval: WorkflowApprovalRequestRecord = {
        approvalRequestId: this.uuid(),
        runId: state.run.runId,
        nodeRunId: nodeRun.nodeRunId,
        artifactId: typeof payload.artifactId === 'string' ? payload.artifactId : undefined,
        status: 'pending',
        requestedActorId: typeof payload.requestedActorId === 'string' ? payload.requestedActorId : state.run.userId,
        payloadJson: {
          ...(Array.isArray(payload.artifactIds) ? { artifactIds: payload.artifactIds.map((item) => String(item)) } : {}),
          ...(Array.isArray(payload.artifactTypes) ? { artifactTypes: payload.artifactTypes.map((item) => String(item)) } : {}),
          ...(typeof payload.resumeToken === 'string' ? { resumeToken: payload.resumeToken } : {}),
          ...(typeof payload.prompt === 'string' ? { prompt: payload.prompt } : {}),
          bridgeSessionId: bridgeSession.bridgeSessionId,
          externalSessionRef: bridgeSession.externalSessionRef,
          ...(isRecord(payload.metadata) ? { metadata: payload.metadata } : {}),
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.approvals.push(approval);
      bridgeSession.status = 'waiting_approval';
      bridgeSession.resumeToken = typeof payload.resumeToken === 'string' ? payload.resumeToken : undefined;
      bridgeSession.updatedAt = timestamp;
      nodeRun.status = 'waiting_approval';
      nodeRun.updatedAt = timestamp;
      nodeRun.metadata = {
        ...(nodeRun.metadata || {}),
        bridgeSessionId: bridgeSession.bridgeSessionId,
        externalSessionRef: bridgeSession.externalSessionRef,
      };
      state.run.status = 'waiting_approval';
      state.run.updatedAt = timestamp;
      return [
        this.buildNodeStateEvent(request.traceId, state.run, nodeRun, 'waiting_approval'),
        this.buildRunStateEvent(request.traceId, state.run, 'waiting_approval'),
        {
          schemaVersion: 'v1',
          eventId: this.uuid(),
          traceId: request.traceId,
          runId: state.run.runId,
          compatProviderId: state.run.compatProviderId,
          timestampMs: timestamp,
          kind: 'approval_requested',
          payload: {
            approvalRequestId: approval.approvalRequestId,
            nodeRunId: nodeRun.nodeRunId,
            taskId: approval.approvalRequestId,
            prompt: typeof payload.prompt === 'string' ? payload.prompt : '等待 bridge 审批后继续执行。',
          },
        },
      ];
    }

    if (request.kind === 'result') {
      bridgeSession.status = 'completed';
      bridgeSession.resumeToken = undefined;
      bridgeSession.updatedAt = timestamp;
      bridgeSession.metadataJson = {
        ...(bridgeSession.metadataJson || {}),
        completedAt: request.emittedAt,
      };
      nodeRun.status = 'completed';
      nodeRun.updatedAt = timestamp;
      this.cancelPendingApprovals(state, nodeRun.nodeRunId);
      const completionMetadata = normalizeCompatCompletionMetadata(payload);
      const createdArtifacts = this.createArtifactsFromCompatMetadata(state, nodeRun, completionMetadata);
      this.applyCompatCompanionMetadata(state, completionMetadata);
      if (createdArtifacts.length === 0) {
        createdArtifacts.push(this.createArtifact(
          state,
          nodeRun,
          'executor_result',
          'validated',
          {
            externalSessionRef: bridgeSession.externalSessionRef,
            result: payload,
          },
        ));
      }

      const events: WorkflowFormalEvent[] = [
        this.buildNodeStateEvent(request.traceId, state.run, nodeRun, 'completed'),
      ];
      for (const artifact of createdArtifacts) {
        events.push({
          schemaVersion: 'v1',
          eventId: this.uuid(),
          traceId: request.traceId,
          runId: state.run.runId,
          compatProviderId: state.run.compatProviderId,
          timestampMs: timestamp,
          kind: 'artifact_created',
          payload: {
            artifactId: artifact.artifactId,
            artifactType: artifact.artifactType,
            state: artifact.state,
          },
        });
      }
      if (node.transitions?.success) {
        const tail = await this.advanceToNode(
          state,
          node.transitions.success,
          request.traceId,
          {},
          new Set<string>([nodeRun.nodeKey]),
          false,
        );
        return [...events, ...tail];
      }
      state.run.status = 'completed';
      state.run.updatedAt = timestamp;
      state.run.completedAt = timestamp;
      events.push(this.buildRunStateEvent(request.traceId, state.run, 'completed'));
      return events;
    }

    bridgeSession.status = 'failed';
    bridgeSession.updatedAt = timestamp;
    bridgeSession.metadataJson = {
      ...(bridgeSession.metadataJson || {}),
      lastError: payload,
    };
    nodeRun.status = 'failed';
    nodeRun.updatedAt = timestamp;
    nodeRun.metadata = {
      ...(nodeRun.metadata || {}),
      bridgeError: payload,
    };
    this.cancelPendingApprovals(state, nodeRun.nodeRunId);
    state.run.status = 'failed';
    state.run.updatedAt = timestamp;
    return [
      this.buildNodeStateEvent(request.traceId, state.run, nodeRun, 'failed'),
      this.buildRunStateEvent(request.traceId, state.run, 'failed'),
    ];
  }

  private async invokeExecutor(
    state: InternalRunState,
    node: WorkflowNodeSpec,
    traceId: string,
    inputText?: string,
    inputPayload?: Record<string, unknown>,
  ): Promise<InteractionEvent[]> {
    if (!node.executorId) {
      throw new Error(`executor node missing executorId: ${node.nodeKey}`);
    }
    const executor = this.compatExecutorClient.getExecutorEntry(node.executorId);
    if (!executor) {
      throw new Error(`executor not found: ${node.executorId}`);
    }

    const rawPayload = {
      ...(inputPayload || {}),
      __workflow: this.buildWorkflowEnvelope(state, node),
    };
    const input: UnifiedUserInput = {
      schemaVersion: 'v0',
      traceId,
      userId: state.run.userId,
      sessionId: state.run.sessionId,
      source: 'app',
      text: inputText,
      raw: rawPayload,
      timestampMs: this.now(),
    };
    return this.compatExecutorClient.invoke({
      executor,
      input,
      context: buildContextPackage(state.run),
      runId: state.run.runId,
    });
  }

  private async interactExecutor(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    node: WorkflowNodeSpec,
    traceId: string,
    request: WorkflowRuntimeResumeRunRequest,
  ): Promise<InteractionEvent[]> {
    if (!node.executorId) {
      throw new Error(`executor node missing executorId: ${node.nodeKey}`);
    }
    const executor = this.compatExecutorClient.getExecutorEntry(node.executorId);
    if (!executor) {
      throw new Error(`executor not found: ${node.executorId}`);
    }

    const interactionPayload = {
      ...(request.payload || {}),
      __workflow: this.buildWorkflowEnvelope(state, node),
    };
    const interaction: UserInteraction = {
      schemaVersion: 'v0',
      traceId,
      sessionId: state.run.sessionId,
      userId: state.run.userId,
      providerId: state.run.compatProviderId,
      runId: state.run.runId,
      actionId: request.actionId,
      payload: interactionPayload,
      replyToken: request.replyToken,
      inReplyTo: request.taskId
        ? {
            providerId: state.run.compatProviderId,
            runId: state.run.runId,
            taskId: request.taskId,
            questionId: nodeRun.questionId,
          }
        : undefined,
      timestampMs: this.now(),
    };

    return this.compatExecutorClient.interact({
      executor,
      interaction,
      context: buildContextPackage(state.run),
    });
  }

  private async consumeCompatEvents(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    traceId: string,
    compatEvents: InteractionEvent[],
    visited: Set<string>,
  ): Promise<WorkflowFormalEvent[]> {
    const events: WorkflowFormalEvent[] = [];
    const node = findNode(state.version.spec, nodeRun.nodeKey);

    for (const compatEvent of compatEvents) {
      if (compatEvent.type !== 'provider_extension') {
        events.push({
          schemaVersion: 'v1',
          eventId: this.uuid(),
          traceId,
          runId: state.run.runId,
          compatProviderId: state.run.compatProviderId,
          timestampMs: this.now(),
          kind: 'compat_interaction',
          payload: {
            interaction: compatEvent,
          },
        });
        continue;
      }

      if (compatEvent.extensionKind === 'task_question') {
        nodeRun.status = 'waiting_input';
        nodeRun.taskId = compatEvent.payload.taskId;
        nodeRun.questionId = compatEvent.payload.questionId;
        nodeRun.replyToken = compatEvent.payload.replyToken;
        nodeRun.waitKey = compatEvent.payload.replyToken;
        nodeRun.compatTaskState = 'collecting';
        nodeRun.updatedAt = this.now();
        state.run.status = 'waiting_input';
        state.run.updatedAt = this.now();
        events.push(this.buildRunStateEvent(traceId, state.run, 'waiting_input'));
        events.push({
          schemaVersion: 'v1',
          eventId: this.uuid(),
          traceId,
          runId: state.run.runId,
          compatProviderId: state.run.compatProviderId,
          timestampMs: this.now(),
          kind: 'waiting_input',
          payload: {
            nodeRunId: nodeRun.nodeRunId,
            nodeKey: nodeRun.nodeKey,
            taskId: compatEvent.payload.taskId,
            questionId: compatEvent.payload.questionId,
            replyToken: compatEvent.payload.replyToken,
            prompt: compatEvent.payload.prompt,
            answerSchema: compatEvent.payload.answerSchema,
            uiSchema: compatEvent.payload.uiSchema,
            metadata: compatEvent.payload.metadata,
          },
        });
        continue;
      }

      if (compatEvent.extensionKind === 'task_state') {
        nodeRun.taskId = compatEvent.payload.taskId;
        nodeRun.executionPolicy = compatEvent.payload.executionPolicy;
        nodeRun.compatTaskState = compatEvent.payload.state;
        nodeRun.updatedAt = this.now();

        if (compatEvent.payload.state === 'collecting') {
          nodeRun.status = 'waiting_input';
          state.run.status = 'waiting_input';
          state.run.updatedAt = this.now();
          events.push(this.buildRunStateEvent(traceId, state.run, 'waiting_input'));
        } else if (compatEvent.payload.state === 'ready') {
          if (compatEvent.payload.executionPolicy === 'auto_execute') {
            const autoEvents = await this.interactExecutor(
              state,
              nodeRun,
              node,
              traceId,
              {
                schemaVersion: 'v1',
                traceId,
                sessionId: state.run.sessionId,
                userId: state.run.userId,
                runId: state.run.runId,
                compatProviderId: state.run.compatProviderId,
                actionId: 'execute_task',
                taskId: compatEvent.payload.taskId,
              },
            );
            const translated = await this.consumeCompatEvents(state, nodeRun, traceId, autoEvents, visited);
            events.push(...translated);
            continue;
          }
          nodeRun.status = 'paused';
          state.run.status = 'paused';
          state.run.updatedAt = this.now();
          events.push(this.buildRunStateEvent(traceId, state.run, 'paused'));
        } else if (compatEvent.payload.state === 'executing') {
          nodeRun.status = 'running';
          state.run.status = 'running';
          state.run.updatedAt = this.now();
          events.push(this.buildRunStateEvent(traceId, state.run, 'running'));
        } else if (compatEvent.payload.state === 'completed') {
          nodeRun.status = 'completed';
          state.run.updatedAt = this.now();
          const completionMetadata = normalizeCompatCompletionMetadata(compatEvent.payload.metadata);
          const createdArtifacts = this.createArtifactsFromCompatMetadata(state, nodeRun, completionMetadata);
          this.applyCompatCompanionMetadata(state, completionMetadata);
          if (createdArtifacts.length === 0) {
            createdArtifacts.push(this.createArtifact(state, nodeRun, 'executor_result', 'validated', {
              taskId: compatEvent.payload.taskId,
              nodeKey: nodeRun.nodeKey,
              metadata: compatEvent.payload.metadata || {},
            }));
          }

          const nextNode = node.transitions?.success;
          events.push(this.buildNodeStateEvent(traceId, state.run, nodeRun, 'completed'));
          for (const artifact of createdArtifacts) {
            events.push({
              schemaVersion: 'v1',
              eventId: this.uuid(),
              traceId,
              runId: state.run.runId,
              compatProviderId: state.run.compatProviderId,
              timestampMs: this.now(),
              kind: 'artifact_created',
              payload: {
                artifactId: artifact.artifactId,
                artifactType: artifact.artifactType,
                state: artifact.state,
              },
            });
          }
          if (nextNode) {
            const tail = await this.advanceToNode(state, nextNode, traceId, {}, visited, false);
            events.push(...tail);
            continue;
          }
          state.run.status = 'completed';
          state.run.completedAt = this.now();
          events.push(this.buildRunStateEvent(traceId, state.run, 'completed'));
          continue;
        } else if (compatEvent.payload.state === 'failed') {
          nodeRun.status = 'failed';
          state.run.status = 'failed';
          state.run.updatedAt = this.now();
          events.push(this.buildRunStateEvent(traceId, state.run, 'failed'));
        }

        events.push({
          schemaVersion: 'v1',
          eventId: this.uuid(),
          traceId,
          runId: state.run.runId,
          compatProviderId: state.run.compatProviderId,
          timestampMs: this.now(),
          kind: 'node_state',
          payload: {
            nodeRunId: nodeRun.nodeRunId,
            nodeKey: nodeRun.nodeKey,
            nodeType: nodeRun.nodeType,
            status: nodeRun.status,
            compatTaskState: compatEvent.payload.state,
            executionPolicy: compatEvent.payload.executionPolicy,
            taskId: compatEvent.payload.taskId,
            metadata: compatEvent.payload.metadata,
          },
        });
      }
    }

    if (!events.some((event) => event.kind === 'node_state' && event.payload.status && isWorkflowNodeTerminal(event.payload.status))) {
      events.push(this.buildNodeStateEvent(traceId, state.run, nodeRun, nodeRun.status));
    }

    return events;
  }

  private createApprovalRequest(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    node: WorkflowNodeSpec,
  ): WorkflowApprovalRequestRecord {
    const reviewArtifactTypes = Array.isArray(node.config?.reviewArtifactTypes)
      ? node.config?.reviewArtifactTypes.map((item) => String(item))
      : ['AssessmentDraft', 'EvidencePack'];
    const reviewArtifacts = state.artifacts.filter((artifact) => reviewArtifactTypes.includes(artifact.artifactType));
    const runInput = this.getRunInputPayload(state);
    const teacherActor = isRecord(runInput?.teacherActor) && typeof runInput?.teacherActor.actorId === 'string'
      ? runInput.teacherActor.actorId
      : state.run.userId;
    const approval: WorkflowApprovalRequestRecord = {
      approvalRequestId: this.uuid(),
      runId: state.run.runId,
      nodeRunId: nodeRun.nodeRunId,
      artifactId: reviewArtifacts[0]?.artifactId,
      status: 'pending',
      requestedActorId: teacherActor,
      payloadJson: reviewArtifacts.length > 0
        ? {
            artifactIds: reviewArtifacts.map((artifact) => artifact.artifactId),
            artifactTypes: reviewArtifacts.map((artifact) => artifact.artifactType),
          }
        : undefined,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    state.approvals.push(approval);
    return approval;
  }

  private createArtifactsFromCompatMetadata(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    metadata: WorkflowCompatCompletionMetadata,
  ): WorkflowArtifactRecord[] {
    const artifacts: WorkflowArtifactRecord[] = [];
    for (const seed of metadata.artifacts || []) {
      artifacts.push(this.createArtifact(
        state,
        nodeRun,
        seed.artifactType,
        seed.state || 'validated',
        seed.payload,
        seed.metadata,
        seed.schemaRef,
      ));
    }
    this.resolveCompatArtifactReferences(artifacts);
    return artifacts;
  }

  private resolveCompatArtifactReferences(artifacts: WorkflowArtifactRecord[]): void {
    for (const artifact of artifacts) {
      if (artifact.artifactType !== 'AnalysisRecipeCandidate') continue;
      const lineage = isRecord(artifact.metadataJson?.lineage) ? artifact.metadataJson.lineage : undefined;
      const evidenceArtifactTypes = Array.isArray(lineage?.evidenceArtifactTypes)
        ? lineage.evidenceArtifactTypes.map((item) => String(item)).filter(Boolean)
        : [];
      if (evidenceArtifactTypes.length === 0) continue;

      const evidenceRefs = artifacts
        .filter((candidate) => evidenceArtifactTypes.includes(candidate.artifactType))
        .map((candidate) => candidate.artifactId);
      if (evidenceRefs.length === 0) continue;

      artifact.payloadJson = {
        ...artifact.payloadJson,
        evidenceRefs,
      };
      artifact.metadataJson = {
        ...(artifact.metadataJson || {}),
        lineage: {
          ...(lineage || {}),
          evidenceRefs,
        },
      };
      artifact.updatedAt = this.now();
    }
  }

  private applyCompatCompanionMetadata(
    state: InternalRunState,
    metadata: WorkflowCompatCompletionMetadata,
  ): void {
    for (const seed of metadata.actorProfiles || []) {
      this.upsertActorProfile(state, seed);
    }
    for (const seed of metadata.actorMemberships || []) {
      this.upsertActorMembership(state, seed);
    }
    if (metadata.audienceSelector) {
      this.upsertAudienceSelector(state, metadata.audienceSelector);
    }
    if (metadata.deliverySpec) {
      this.upsertDeliverySpec(state, metadata.deliverySpec);
    }
    for (const seed of metadata.deliveryTargets || []) {
      this.upsertDeliveryTarget(state, seed);
    }
  }

  private upsertActorProfile(state: InternalRunState, seed: WorkflowCompatActorProfileSeed): void {
    const existing = state.actorProfiles.find((item) => item.actorId === seed.actorId);
    const timestamp = this.now();
    const next: ActorProfileRecord = {
      runId: state.run.runId,
      actorId: seed.actorId,
      workspaceId: seed.workspaceId,
      status: seed.status,
      displayName: seed.displayName,
      actorType: seed.actorType,
      payloadJson: seed.payloadJson,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    if (existing) {
      Object.assign(existing, next);
    } else {
      state.actorProfiles.push(next);
    }
  }

  private upsertActorMembership(state: InternalRunState, seed: WorkflowCompatActorMembershipSeed): void {
    const existing = state.actorMemberships.find((item) => item.actorMembershipId === seed.actorMembershipId);
    const timestamp = this.now();
    const next: ActorMembershipRecord = {
      runId: state.run.runId,
      actorMembershipId: seed.actorMembershipId,
      fromActorId: seed.fromActorId,
      toActorId: seed.toActorId,
      relationType: seed.relationType,
      status: seed.status,
      confirmedAt: seed.confirmedAt,
      payloadJson: seed.payloadJson,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    if (existing) {
      Object.assign(existing, next);
    } else {
      state.actorMemberships.push(next);
    }
  }

  private upsertAudienceSelector(state: InternalRunState, seed: WorkflowCompatAudienceSelectorSeed): void {
    const existing = state.audienceSelectors.find((item) => item.audienceSelectorId === seed.audienceSelectorId);
    const timestamp = this.now();
    const next: AudienceSelectorRecord = {
      audienceSelectorId: seed.audienceSelectorId,
      status: seed.status,
      selectorJson: seed.selectorJson,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    if (existing) {
      Object.assign(existing, next);
    } else {
      state.audienceSelectors.push(next);
    }
  }

  private upsertDeliverySpec(state: InternalRunState, seed: WorkflowCompatDeliverySpecSeed): void {
    const existing = state.deliverySpecs.find((item) => item.deliverySpecId === seed.deliverySpecId);
    const timestamp = this.now();
    const next: DeliverySpecRecord = {
      deliverySpecId: seed.deliverySpecId,
      audienceSelectorId: seed.audienceSelectorId,
      reviewRequired: seed.reviewRequired,
      deliveryMode: seed.deliveryMode,
      status: seed.status,
      configJson: seed.configJson,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    if (existing) {
      Object.assign(existing, next);
    } else {
      state.deliverySpecs.push(next);
    }
  }

  private upsertDeliveryTarget(state: InternalRunState, seed: WorkflowCompatDeliveryTargetSeed): void {
    const existing = state.deliveryTargets.find((item) => item.deliveryTargetId === seed.deliveryTargetId);
    const timestamp = this.now();
    const next: DeliveryTargetRecord = {
      deliveryTargetId: seed.deliveryTargetId,
      runId: state.run.runId,
      deliverySpecId: seed.deliverySpecId,
      targetActorId: seed.targetActorId,
      status: seed.status,
      payloadJson: seed.payloadJson,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    if (existing) {
      Object.assign(existing, next);
    } else {
      state.deliveryTargets.push(next);
    }
  }

  private createArtifact(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    artifactType: string,
    stateName: WorkflowArtifactRecord['state'],
    payloadJson: Record<string, unknown>,
    metadataJson?: Record<string, unknown>,
    schemaRef?: string,
  ): WorkflowArtifactRecord {
    const artifact: WorkflowArtifactRecord = {
      artifactId: this.uuid(),
      runId: state.run.runId,
      nodeRunId: nodeRun.nodeRunId,
      artifactType,
      state: stateName,
      schemaRef,
      payloadJson,
      metadataJson,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    state.artifacts.push(artifact);
    nodeRun.outputArtifactId = artifact.artifactId;
    nodeRun.updatedAt = this.now();
    return artifact;
  }

  private buildRunStateEvent(
    traceId: string,
    run: WorkflowRunRecord,
    status: WorkflowRunRecord['status'],
  ): WorkflowFormalEvent {
    return {
      schemaVersion: 'v1',
      eventId: this.uuid(),
      traceId,
      runId: run.runId,
      compatProviderId: run.compatProviderId,
      timestampMs: this.now(),
      kind: 'run_state',
      payload: { status },
    };
  }

  private buildNodeStateEvent(
    traceId: string,
    run: WorkflowRunRecord,
    nodeRun: WorkflowNodeRunRecord,
    status: WorkflowNodeRunRecord['status'],
  ): WorkflowFormalEvent {
    return {
      schemaVersion: 'v1',
      eventId: this.uuid(),
      traceId,
      runId: run.runId,
      compatProviderId: run.compatProviderId,
      timestampMs: this.now(),
      kind: 'node_state',
      payload: {
        nodeRunId: nodeRun.nodeRunId,
        nodeKey: nodeRun.nodeKey,
        nodeType: nodeRun.nodeType,
        status,
        compatTaskState: nodeRun.compatTaskState,
        executionPolicy: nodeRun.executionPolicy,
        taskId: nodeRun.taskId,
        metadata: nodeRun.metadata,
      },
    };
  }

  private async enqueueFormalEvents(
    traceId: string,
    state: InternalRunState,
    events: WorkflowFormalEvent[],
  ): Promise<void> {
    if (!this.outboxPool || events.length === 0 || (isWorkflowRunTerminal(state.run.status) === false && events.length === 0)) {
      return;
    }
    const payload = {
      schemaVersion: 'v1',
      traceId,
      sessionId: state.run.sessionId,
      userId: state.run.userId,
      compatProviderId: state.run.compatProviderId,
      runId: state.run.runId,
      events,
    };
    try {
      await this.outboxPool.query(
        `
          INSERT INTO outbox_events (event_id, session_id, channel, payload, status, attempts, max_attempts, next_retry_at)
          VALUES ($1, $2, 'workflow_formal_event', $3::jsonb, 'pending', 0, 12, NOW())
        `,
        [this.uuid(), state.run.sessionId, JSON.stringify(payload)],
      );
    } catch (error) {
      logger.warn('workflow runtime outbox enqueue failed', serializeError(error));
    }
  }
}

export function createWorkflowRuntimeService(deps: RuntimeServiceDeps): WorkflowRuntimeService {
  return new WorkflowRuntimeService(deps);
}
