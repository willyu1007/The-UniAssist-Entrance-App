import { Pool } from 'pg';

import type { ConnectorRuntimeClient } from '@uniassist/connector-sdk';
import type { ExternalBridgeClient } from '@uniassist/executor-sdk';
import type {
  ActorMembershipRecord,
  ActorProfileRecord,
  AudienceSelectorRecord,
  BridgeCallbackReceiptRecord,
  BridgeInvokeSessionRecord,
  ConnectorActionExecutionSnapshot,
  ConnectorActionSessionRecord,
  ConnectorEventReceiptRecord,
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
  WorkflowArtifactSeed,
  WorkflowActorMembershipSeed,
  WorkflowActorProfileSeed,
  WorkflowAudienceSelectorSeed,
  WorkflowCommandResponse,
  WorkflowDeliverySpecSeed,
  WorkflowDeliveryTargetSeed,
  WorkflowFormalEvent,
  WorkflowInteractionRequestRecord,
  WorkflowLedgerResult,
  WorkflowNodeRunRecord,
  WorkflowNodeSpec,
  WorkflowRunListResponse,
  WorkflowRunRecord,
  WorkflowRunSnapshot,
  WorkflowRunSummary,
  WorkflowRuntimeContextEnvelope,
  WorkflowRuntimeBridgeCallbackRequest,
  WorkflowRuntimeBridgeCallbackResponse,
  WorkflowRuntimeCancelRunRequest,
  WorkflowRuntimeConnectorActionSessionLookupResponse,
  WorkflowRuntimeConnectorCallbackRequest,
  WorkflowRuntimeConnectorCallbackResponse,
  WorkflowRuntimeRecordEventSubscriptionReceiptRequest,
  WorkflowRuntimeRecordEventSubscriptionReceiptResponse,
  WorkflowRuntimeResumeRunRequest,
  WorkflowRuntimeStartRunRequest,
  WorkflowTemplateSpec,
} from '@uniassist/workflow-contracts';
import { isWorkflowNodeTerminal, isWorkflowRunTerminal } from '@uniassist/workflow-contracts';
import { createLogger, serializeError } from '@uniassist/shared';
import { createRuntimeRepository, type RuntimeRepository } from './runtime-repository';
import type { InternalRunState, RuntimeStore } from './store';

type RuntimeServiceDeps = {
  store: RuntimeStore;
  connectorRuntimeClient: ConnectorRuntimeClient;
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

type NativePlatformExecutorId =
  | 'platform.emit_artifact'
  | 'platform.request_interaction'
  | 'platform.fail';

type NativeEmitArtifactConfig = {
  artifactType: string;
  state: WorkflowArtifactRecord['state'];
  payloadMode: 'input' | 'static';
  staticPayload?: Record<string, unknown>;
  metadataJson?: Record<string, unknown>;
  schemaRef?: string;
};

type NativeRequestInteractionConfig = {
  prompt: string;
  answerSchemaJson: Record<string, unknown>;
  uiSchemaJson: Record<string, unknown>;
  payloadJson?: Record<string, unknown>;
  metadataJson?: Record<string, unknown>;
  responseArtifactType?: string;
  responseArtifactState?: WorkflowArtifactRecord['state'];
  responseSchemaRef?: string;
};

type NativeFailConfig = {
  code?: string;
  message?: string;
  metadataJson?: Record<string, unknown>;
};

const NATIVE_PLATFORM_EXECUTOR_IDS = new Set<NativePlatformExecutorId>([
  'platform.emit_artifact',
  'platform.request_interaction',
  'platform.fail',
]);

const DEFAULT_NATIVE_INTERACTION_ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: true,
};

const DEFAULT_NATIVE_INTERACTION_UI_SCHEMA = {};

function getNativeExecutorId(node: WorkflowNodeSpec): NativePlatformExecutorId | undefined {
  if (node.nodeType !== 'executor' || typeof node.executorId !== 'string') {
    return undefined;
  }
  if (!NATIVE_PLATFORM_EXECUTOR_IDS.has(node.executorId as NativePlatformExecutorId)) {
    return undefined;
  }
  return node.executorId as NativePlatformExecutorId;
}

function normalizeArtifactState(
  value: unknown,
  fallback: WorkflowArtifactRecord['state'],
): WorkflowArtifactRecord['state'] {
  const allowed = new Set<WorkflowArtifactRecord['state']>([
    'draft',
    'validated',
    'review_required',
    'published',
    'superseded',
    'archived',
  ]);
  if (typeof value === 'string' && allowed.has(value as WorkflowArtifactRecord['state'])) {
    return value as WorkflowArtifactRecord['state'];
  }
  return fallback;
}

function getNativeEmitArtifactConfig(node: WorkflowNodeSpec): NativeEmitArtifactConfig {
  const config = isRecord(node.config) ? node.config : {};
  const artifactType = typeof config.artifactType === 'string' && config.artifactType.trim() !== ''
    ? config.artifactType.trim()
    : undefined;
  if (!artifactType) {
    throw new RuntimeRequestError(
      409,
      'NATIVE_ARTIFACT_TYPE_REQUIRED',
      `native executor ${node.executorId} requires config.artifactType`,
    );
  }
  return {
    artifactType,
    state: normalizeArtifactState(config.state, 'validated'),
    payloadMode: config.payloadMode === 'static' ? 'static' : 'input',
    staticPayload: isRecord(config.staticPayload) ? config.staticPayload : undefined,
    metadataJson: isRecord(config.metadataJson) ? config.metadataJson : undefined,
    schemaRef: typeof config.schemaRef === 'string' && config.schemaRef.trim() !== '' ? config.schemaRef.trim() : undefined,
  };
}

function getNativeRequestInteractionConfig(node: WorkflowNodeSpec): NativeRequestInteractionConfig {
  const config = isRecord(node.config) ? node.config : {};
  return {
    prompt: typeof config.prompt === 'string' && config.prompt.trim() !== ''
      ? config.prompt.trim()
      : `Provide input to continue ${node.nodeKey}.`,
    answerSchemaJson: isRecord(config.answerSchemaJson)
      ? config.answerSchemaJson
      : DEFAULT_NATIVE_INTERACTION_ANSWER_SCHEMA,
    uiSchemaJson: isRecord(config.uiSchemaJson)
      ? config.uiSchemaJson
      : DEFAULT_NATIVE_INTERACTION_UI_SCHEMA,
    payloadJson: isRecord(config.payloadJson) ? config.payloadJson : undefined,
    metadataJson: isRecord(config.metadataJson) ? config.metadataJson : undefined,
    responseArtifactType: typeof config.responseArtifactType === 'string' && config.responseArtifactType.trim() !== ''
      ? config.responseArtifactType.trim()
      : undefined,
    responseArtifactState: normalizeArtifactState(config.responseArtifactState, 'validated'),
    responseSchemaRef: typeof config.responseSchemaRef === 'string' && config.responseSchemaRef.trim() !== ''
      ? config.responseSchemaRef.trim()
      : undefined,
  };
}

function getNativeFailConfig(node: WorkflowNodeSpec): NativeFailConfig {
  const config = isRecord(node.config) ? node.config : {};
  return {
    code: typeof config.code === 'string' && config.code.trim() !== '' ? config.code.trim() : undefined,
    message: typeof config.message === 'string' && config.message.trim() !== '' ? config.message.trim() : undefined,
    metadataJson: isRecord(config.metadataJson) ? config.metadataJson : undefined,
  };
}

function isBridgeSessionTerminal(status: BridgeInvokeSessionRecord['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function findNode(spec: WorkflowTemplateSpec, nodeKey: string): WorkflowNodeSpec {
  const node = spec.nodes.find((item) => item.nodeKey === nodeKey);
  if (!node) {
    throw new Error(`workflow node not found: ${nodeKey}`);
  }
  return node;
}

function buildConnectorRuntimeProjection(state: InternalRunState): Record<string, unknown> | undefined {
  if (state.connectorActionSessions.length === 0 && state.connectorEventReceipts.length === 0) {
    return undefined;
  }
  return {
    actionSessions: state.connectorActionSessions.map((item) => ({
      ...item,
      metadataJson: item.metadataJson ? { ...item.metadataJson } : undefined,
    })),
    eventReceipts: state.connectorEventReceipts.map((item) => ({ ...item })),
  };
}

function cloneSnapshot(state: InternalRunState): WorkflowRunSnapshot {
  const connectorRuntimeProjection = buildConnectorRuntimeProjection(state);
  const runMetadata = (
    state.run.metadata
    || connectorRuntimeProjection
  )
    ? {
        ...(state.run.metadata ? { ...state.run.metadata } : {}),
        ...(connectorRuntimeProjection ? { connectorRuntime: connectorRuntimeProjection } : {}),
      }
    : undefined;
  return {
    run: {
      ...state.run,
      metadata: runMetadata,
    },
    nodeRuns: state.nodeRuns.map((item) => ({
      ...item,
      inputJson: item.inputJson ? { ...item.inputJson } : undefined,
      metadata: item.metadata ? { ...item.metadata } : undefined,
    })),
    approvals: state.approvals.map((item) => ({ ...item, payloadJson: item.payloadJson ? { ...item.payloadJson } : undefined })),
    approvalDecisions: state.decisions.map((item) => ({ ...item, payloadJson: item.payloadJson ? { ...item.payloadJson } : undefined })),
    interactionRequests: state.interactionRequests.map((item) => ({
      ...item,
      answerSchemaJson: { ...item.answerSchemaJson },
      uiSchemaJson: { ...item.uiSchemaJson },
      payloadJson: item.payloadJson ? { ...item.payloadJson } : undefined,
      responsePayloadJson: item.responsePayloadJson ? { ...item.responsePayloadJson } : undefined,
      metadataJson: item.metadataJson ? { ...item.metadataJson } : undefined,
    })),
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

function cloneInternalRunState(state: InternalRunState): InternalRunState {
  return structuredClone(state);
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
  const blocker = snapshot.run.status === 'waiting_interaction'
    ? 'waiting_interaction'
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
    agentId: snapshot.run.agentId,
    startMode: snapshot.run.startMode,
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

function normalizeArtifactSeeds(value: unknown): WorkflowArtifactSeed[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((item) => typeof item.artifactType === 'string' && isRecord(item.payload))
    .map((item) => ({
      artifactType: String(item.artifactType),
      state: typeof item.state === 'string' ? item.state as WorkflowArtifactSeed['state'] : undefined,
      schemaRef: typeof item.schemaRef === 'string' ? item.schemaRef : undefined,
      payload: item.payload as Record<string, unknown>,
      metadata: isRecord(item.metadata) ? item.metadata : undefined,
    }));
}

function normalizeActorProfiles(value: unknown): WorkflowActorProfileSeed[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((item) => typeof item.actorId === 'string' && typeof item.workspaceId === 'string' && typeof item.displayName === 'string')
    .map((item) => ({
      actorId: String(item.actorId),
      workspaceId: String(item.workspaceId),
      status: String(item.status || 'active') as WorkflowActorProfileSeed['status'],
      displayName: String(item.displayName),
      actorType: String(item.actorType || 'person') as WorkflowActorProfileSeed['actorType'],
      payloadJson: isRecord(item.payloadJson) ? item.payloadJson : undefined,
    }));
}

function normalizeActorMemberships(value: unknown): WorkflowActorMembershipSeed[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((item) => typeof item.actorMembershipId === 'string' && typeof item.fromActorId === 'string' && typeof item.toActorId === 'string')
    .map((item) => ({
      actorMembershipId: String(item.actorMembershipId),
      fromActorId: String(item.fromActorId),
      toActorId: String(item.toActorId),
      relationType: String(item.relationType || 'related_to'),
      status: String(item.status || 'active') as WorkflowActorMembershipSeed['status'],
      confirmedAt: typeof item.confirmedAt === 'number' ? item.confirmedAt : undefined,
      payloadJson: isRecord(item.payloadJson) ? item.payloadJson : undefined,
    }));
}

function normalizeAudienceSelector(value: unknown): WorkflowAudienceSelectorSeed | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.audienceSelectorId !== 'string' || !isRecord(value.selectorJson)) return undefined;
  return {
    audienceSelectorId: String(value.audienceSelectorId),
    status: String(value.status || 'draft') as WorkflowAudienceSelectorSeed['status'],
    selectorJson: value.selectorJson,
  };
}

function normalizeDeliverySpec(value: unknown): WorkflowDeliverySpecSeed | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.deliverySpecId !== 'string' || typeof value.audienceSelectorId !== 'string') return undefined;
  return {
    deliverySpecId: String(value.deliverySpecId),
    audienceSelectorId: String(value.audienceSelectorId),
    reviewRequired: value.reviewRequired !== false,
    deliveryMode: String(value.deliveryMode || 'manual_handoff') as WorkflowDeliverySpecSeed['deliveryMode'],
    status: String(value.status || 'draft') as WorkflowDeliverySpecSeed['status'],
    configJson: isRecord(value.configJson) ? value.configJson : undefined,
  };
}

function normalizeDeliveryTargets(value: unknown): WorkflowDeliveryTargetSeed[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((item) => typeof item.deliveryTargetId === 'string' && typeof item.deliverySpecId === 'string')
    .map((item) => ({
      deliveryTargetId: String(item.deliveryTargetId),
      deliverySpecId: String(item.deliverySpecId),
      targetActorId: typeof item.targetActorId === 'string' ? item.targetActorId : undefined,
      status: String(item.status || 'pending_resolution') as WorkflowDeliveryTargetSeed['status'],
      payloadJson: isRecord(item.payloadJson) ? item.payloadJson : undefined,
    }));
}

function normalizeLedgerResult(value: unknown): WorkflowLedgerResult {
  if (!isRecord(value)) return {};
  return {
    artifacts: normalizeArtifactSeeds(value.artifacts),
    actorProfiles: normalizeActorProfiles(value.actorProfiles),
    actorMemberships: normalizeActorMemberships(value.actorMemberships),
    audienceSelector: normalizeAudienceSelector(value.audienceSelector),
    deliverySpec: normalizeDeliverySpec(value.deliverySpec),
    deliveryTargets: normalizeDeliveryTargets(value.deliveryTargets),
  };
}

function getConnectorActionSnapshots(value: unknown): Record<string, ConnectorActionExecutionSnapshot> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => (
      isRecord(entry)
      && typeof entry.actionRef === 'string'
      && typeof entry.actionBindingId === 'string'
      && typeof entry.connectorBindingId === 'string'
      && typeof entry.connectorKey === 'string'
      && typeof entry.capabilityId === 'string'
      && typeof entry.sideEffectClass === 'string'
      && typeof entry.executionMode === 'string'
      && typeof entry.browserFallbackMode === 'string'
      && isRecord(entry.configJson)
    )),
  ) as Record<string, ConnectorActionExecutionSnapshot>;
}

export class WorkflowRuntimeService {
  private readonly store: RuntimeStore;

  private readonly connectorRuntimeClient: ConnectorRuntimeClient;

  private readonly externalBridgeClient: ExternalBridgeClient;

  private readonly now: () => number;

  private readonly uuid: () => string;

  private readonly outboxPool?: Pool;

  private readonly repository?: RuntimeRepository;

  constructor(deps: RuntimeServiceDeps) {
    this.store = deps.store;
    this.connectorRuntimeClient = deps.connectorRuntimeClient;
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
    if (request.connectorActions) runMetadata.connectorActions = request.connectorActions;
    if (request.externalRuntime) runMetadata.externalRuntime = request.externalRuntime;
    const run: WorkflowRunRecord = {
      runId: this.uuid(),
      workflowId: request.template.workflowId,
      workflowKey: request.template.workflowKey,
      templateVersionId: request.version.templateVersionId,
      agentId: request.agentId,
      startMode: request.startMode,
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
      interactionRequests: [],
      artifacts: [],
      actorProfiles: [],
      actorMemberships: [],
      audienceSelectors: [],
      deliverySpecs: [],
      deliveryTargets: [],
      bridgeInvokeSessions: [],
      bridgeCallbackReceipts: [],
      connectorActionSessions: [],
      connectorEventReceipts: [],
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
    const rollbackState = cloneInternalRunState(state);
    const current = state.nodeRuns.find((item) => item.nodeRunId === state.run.currentNodeRunId);
    if (!current) {
      throw new Error(`workflow run missing current node: ${request.runId}`);
    }

    if (current.nodeType === 'approval_gate') {
      throw new RuntimeRequestError(
        409,
        'APPROVAL_RESUME_REMOVED',
        'approval resume moved to approval decision APIs',
      );
    }
    let events: WorkflowFormalEvent[];
    try {
      events = await this.resumeExecutorNode(state, current, request.traceId, request);
    } catch (error) {
      this.store.saveRun(rollbackState);
      throw error;
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

    const currentNode = state.nodeRuns.find((item) => item.nodeRunId === state.run.currentNodeRunId);
    if (!currentNode) {
      throw new RuntimeRequestError(409, 'RUN_CURRENT_NODE_MISSING', `workflow run missing current node: ${request.runId}`);
    }
    const bridge = this.getExternalRuntimeBridge(state);
    const bridgeSession = bridge && currentNode.nodeType === 'executor'
      ? this.findBridgeInvokeSession(state, {
          bridgeId: bridge.bridgeId,
          nodeRunId: currentNode.nodeRunId,
        })
      : undefined;

    if (bridge) {
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
      await this.persistExternalReceiptEvent(request.traceId, state, {
        nodeRunId: bridgeSession.nodeRunId,
        bridgeId: bridgeSession.bridgeId,
        bridgeSessionId: bridgeSession.bridgeSessionId,
        callbackKind: request.kind,
        externalSessionRef: bridgeSession.externalSessionRef,
        receiptSourceKind: 'bridge_callback',
        metadata: {
          callbackId: request.callbackId,
          sequence: request.sequence,
          receiptStatus: receipt.status,
          errorMessage: receipt.errorMessage,
        },
      });
      throw new RuntimeRequestError(409, 'BRIDGE_SESSION_TERMINAL', receipt.errorMessage);
    }

    if (request.sequence !== bridgeSession.lastSequence + 1) {
      receipt.status = 'rejected';
      receipt.errorMessage = `callback sequence out of order: expected ${bridgeSession.lastSequence + 1}, got ${request.sequence}`;
      await this.persistExternalReceiptEvent(request.traceId, state, {
        nodeRunId: bridgeSession.nodeRunId,
        bridgeId: bridgeSession.bridgeId,
        bridgeSessionId: bridgeSession.bridgeSessionId,
        callbackKind: request.kind,
        externalSessionRef: bridgeSession.externalSessionRef,
        receiptSourceKind: 'bridge_callback',
        metadata: {
          callbackId: request.callbackId,
          sequence: request.sequence,
          receiptStatus: receipt.status,
          errorMessage: receipt.errorMessage,
        },
      });
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
      await this.persistExternalReceiptEvent(request.traceId, state, {
        nodeRunId: bridgeSession.nodeRunId,
        bridgeId: bridgeSession.bridgeId,
        bridgeSessionId: bridgeSession.bridgeSessionId,
        callbackKind: request.kind,
        externalSessionRef: bridgeSession.externalSessionRef,
        receiptSourceKind: 'bridge_callback',
        metadata: {
          callbackId: request.callbackId,
          sequence: request.sequence,
          receiptStatus: receipt.status,
          errorMessage: receipt.errorMessage,
        },
      });
      throw error;
    }
    events = [
      this.buildExternalReceiptEvent(request.traceId, state.run.runId, {
        nodeRunId: bridgeSession.nodeRunId,
        bridgeId: bridgeSession.bridgeId,
        bridgeSessionId: bridgeSession.bridgeSessionId,
        connectorEventReceiptId: undefined,
        callbackKind: request.kind,
        externalSessionRef: bridgeSession.externalSessionRef,
        receiptSourceKind: 'bridge_callback',
        metadata: {
          callbackId: request.callbackId,
          sequence: request.sequence,
          receiptStatus: receipt.status,
        },
      }),
      ...events,
    ];
    await this.persistState(state);
    await this.enqueueFormalEvents(request.traceId, state, events);
    return {
      schemaVersion: 'v1',
      accepted: true,
      receipt: { ...receipt },
    };
  }

  async handleConnectorCallback(
    request: WorkflowRuntimeConnectorCallbackRequest,
  ): Promise<WorkflowRuntimeConnectorCallbackResponse> {
    const state = await this.requireRunState(request.runId);
    const session = this.findConnectorActionSession(state, {
      connectorActionSessionId: request.connectorActionSessionId,
      nodeRunId: request.nodeRunId,
      externalSessionRef: request.externalSessionRef,
    });
    if (!session) {
      throw new RuntimeRequestError(404, 'CONNECTOR_ACTION_SESSION_NOT_FOUND', 'connector action session not found for callback');
    }

    const receiptKey = request.receiptKey || request.callbackId;
    const duplicateReceipt = state.connectorEventReceipts.find((item) => item.receiptKey === receiptKey);
    if (duplicateReceipt) {
      return {
        schemaVersion: 'v1',
        accepted: true,
        duplicate: true,
        receipt: { ...duplicateReceipt },
      };
    }

    const timestamp = this.now();
    const receipt: ConnectorEventReceiptRecord = {
      connectorEventReceiptId: this.uuid(),
      receiptKey,
      sourceKind: 'action_callback',
      connectorActionSessionId: session.connectorActionSessionId,
      sequence: request.sequence,
      eventType: request.kind,
      status: 'accepted',
      receivedAt: timestamp,
    };
    state.connectorEventReceipts.push(receipt);

    if (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled') {
      receipt.status = 'rejected';
      receipt.errorMessage = 'connector action session is already terminal';
      await this.persistExternalReceiptEvent(request.traceId, state, {
        nodeRunId: session.nodeRunId,
        connectorActionSessionId: session.connectorActionSessionId,
        connectorEventReceiptId: receipt.connectorEventReceiptId,
        callbackKind: request.kind,
        externalSessionRef: session.externalSessionRef,
        receiptSourceKind: 'connector_action_callback',
        metadata: {
          callbackId: request.callbackId,
          receiptKey,
          sequence: request.sequence,
          receiptStatus: receipt.status,
          errorMessage: receipt.errorMessage,
        },
      });
      throw new RuntimeRequestError(409, 'CONNECTOR_ACTION_SESSION_TERMINAL', receipt.errorMessage);
    }

    if (request.sequence !== session.lastSequence + 1) {
      receipt.status = 'rejected';
      receipt.errorMessage = `callback sequence out of order: expected ${session.lastSequence + 1}, got ${request.sequence}`;
      await this.persistExternalReceiptEvent(request.traceId, state, {
        nodeRunId: session.nodeRunId,
        connectorActionSessionId: session.connectorActionSessionId,
        connectorEventReceiptId: receipt.connectorEventReceiptId,
        callbackKind: request.kind,
        externalSessionRef: session.externalSessionRef,
        receiptSourceKind: 'connector_action_callback',
        metadata: {
          callbackId: request.callbackId,
          receiptKey,
          sequence: request.sequence,
          receiptStatus: receipt.status,
          errorMessage: receipt.errorMessage,
        },
      });
      throw new RuntimeRequestError(409, 'CONNECTOR_CALLBACK_OUT_OF_ORDER', receipt.errorMessage);
    }

    const previousSequence = session.lastSequence;
    session.lastSequence = request.sequence;
    session.updatedAt = timestamp;

    let events: WorkflowFormalEvent[] = [];
    try {
      if (request.kind === 'checkpoint') {
        session.metadataJson = {
          ...(session.metadataJson || {}),
          lastCheckpoint: request.payload,
          lastCheckpointAt: request.emittedAt,
        };
      } else if (request.kind === 'result') {
        const nodeRun = state.nodeRuns.find((item) => item.nodeRunId === session.nodeRunId);
        if (!nodeRun) {
          throw new RuntimeRequestError(409, 'NODE_RUN_NOT_FOUND', 'connector callback node run not found');
        }
        const node = findNode(state.version.spec, nodeRun.nodeKey);
        session.status = 'completed';
        session.updatedAt = timestamp;
        events = await this.applyConnectorResult(
          state,
          nodeRun,
          node,
          request.traceId,
          session.externalSessionRef,
          isRecord(request.payload) ? request.payload : undefined,
        );
      } else {
        const nodeRun = state.nodeRuns.find((item) => item.nodeRunId === session.nodeRunId);
        if (!nodeRun) {
          throw new RuntimeRequestError(409, 'NODE_RUN_NOT_FOUND', 'connector callback node run not found');
        }
        session.status = 'failed';
        session.updatedAt = timestamp;
        session.metadataJson = {
          ...(session.metadataJson || {}),
          lastError: request.payload,
        };
        nodeRun.status = 'failed';
        nodeRun.updatedAt = timestamp;
        nodeRun.metadata = {
          ...(nodeRun.metadata || {}),
          connectorError: request.payload,
        };
        this.cancelPendingApprovals(state, nodeRun.nodeRunId);
        state.run.status = 'failed';
        state.run.updatedAt = timestamp;
        events = [
          this.buildNodeStateEvent(request.traceId, state.run, nodeRun, 'failed'),
          this.buildRunStateEvent(request.traceId, state.run, 'failed'),
        ];
      }
    } catch (error) {
      session.lastSequence = previousSequence;
      receipt.status = 'rejected';
      receipt.errorMessage = error instanceof Error ? error.message : 'connector callback rejected';
      await this.persistExternalReceiptEvent(request.traceId, state, {
        nodeRunId: session.nodeRunId,
        connectorActionSessionId: session.connectorActionSessionId,
        connectorEventReceiptId: receipt.connectorEventReceiptId,
        callbackKind: request.kind,
        externalSessionRef: session.externalSessionRef,
        receiptSourceKind: 'connector_action_callback',
        metadata: {
          callbackId: request.callbackId,
          receiptKey,
          sequence: request.sequence,
          receiptStatus: receipt.status,
          errorMessage: receipt.errorMessage,
        },
      });
      throw error;
    }

    events = [
      this.buildExternalReceiptEvent(request.traceId, state.run.runId, {
        nodeRunId: session.nodeRunId,
        connectorActionSessionId: session.connectorActionSessionId,
        connectorEventReceiptId: receipt.connectorEventReceiptId,
        callbackKind: request.kind,
        externalSessionRef: session.externalSessionRef,
        receiptSourceKind: 'connector_action_callback',
        metadata: {
          callbackId: request.callbackId,
          receiptKey,
          sequence: request.sequence,
          receiptStatus: receipt.status,
        },
      }),
      ...events,
    ];
    await this.persistState(state);
    await this.enqueueFormalEvents(request.traceId, state, events);
    return {
      schemaVersion: 'v1',
      accepted: true,
      receipt: { ...receipt },
    };
  }

  async recordEventSubscriptionReceipt(
    request: WorkflowRuntimeRecordEventSubscriptionReceiptRequest,
  ): Promise<WorkflowRuntimeRecordEventSubscriptionReceiptResponse> {
    const state = await this.requireRunState(request.runId);
    const sourceType = typeof state.run.metadata?.sourceType === 'string'
      ? state.run.metadata.sourceType
      : undefined;
    const sourceRef = typeof state.run.metadata?.sourceRef === 'string'
      ? state.run.metadata.sourceRef
      : undefined;
    const runtimeTriggerBindingId = isRecord(state.run.metadata?.runtimeMetadata)
      && typeof state.run.metadata.runtimeMetadata.triggerBindingId === 'string'
      ? state.run.metadata.runtimeMetadata.triggerBindingId
      : undefined;
    if (
      sourceType !== 'event_subscription'
      || sourceRef !== request.triggerBindingId
      || (runtimeTriggerBindingId && runtimeTriggerBindingId !== request.triggerBindingId)
    ) {
      throw new RuntimeRequestError(
        409,
        'EVENT_SUBSCRIPTION_RUN_MISMATCH',
        'event subscription receipt does not match the run source',
      );
    }
    const duplicateReceipt = state.connectorEventReceipts.find((item) => item.receiptKey === request.receiptKey);
    if (duplicateReceipt) {
      return {
        schemaVersion: 'v1',
        accepted: true,
        duplicate: true,
        receipt: { ...duplicateReceipt },
      };
    }

    const receipt: ConnectorEventReceiptRecord = {
      connectorEventReceiptId: this.uuid(),
      receiptKey: request.receiptKey,
      sourceKind: 'event_subscription',
      runId: request.runId,
      eventSubscriptionId: request.eventSubscriptionId,
      eventType: request.eventType,
      status: request.status,
      receivedAt: request.receivedAt,
    };
    state.connectorEventReceipts.push(receipt);
    const events = [
      this.buildExternalReceiptEvent(request.traceId, state.run.runId, {
        connectorEventReceiptId: receipt.connectorEventReceiptId,
        eventSubscriptionId: request.eventSubscriptionId,
        callbackKind: request.eventType,
        receiptSourceKind: 'event_subscription',
        metadata: {
          receiptKey: request.receiptKey,
          triggerBindingId: request.triggerBindingId,
          receiptStatus: request.status,
          ...(request.metadata ? { eventSubscription: request.metadata } : {}),
        },
      }),
    ];
    await this.persistState(state);
    await this.enqueueFormalEvents(request.traceId, state, events);
    return {
      schemaVersion: 'v1',
      accepted: true,
      receipt: { ...receipt },
    };
  }

  async getConnectorActionSessionByPublicCallbackKey(
    publicCallbackKey: string,
  ): Promise<WorkflowRuntimeConnectorActionSessionLookupResponse> {
    const resolved = await this.resolveConnectorActionSessionByPublicCallbackKey(publicCallbackKey);
    if (!resolved) {
      throw new RuntimeRequestError(404, 'CONNECTOR_ACTION_SESSION_NOT_FOUND', 'connector action session not found');
    }
    return {
      schemaVersion: 'v1',
      session: {
        connectorActionSessionId: resolved.session.connectorActionSessionId,
        publicCallbackKey: resolved.session.publicCallbackKey,
        runId: resolved.session.runId,
        nodeRunId: resolved.session.nodeRunId,
        externalSessionRef: resolved.session.externalSessionRef,
        connectorKey: resolved.action.connectorKey,
        action: resolved.action,
      },
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
    const inMemory = this.store.getRun(runId);
    if (inMemory) return cloneSnapshot(inMemory);
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

  async getInteractionRequest(interactionRequestId: string): Promise<WorkflowInteractionRequestRecord | undefined> {
    const inMemory = this.store.getInteractionRequest(interactionRequestId);
    if (inMemory) {
      return structuredClone(inMemory);
    }
    const record = await this.repository?.getInteractionRequest(interactionRequestId);
    return record ? structuredClone(record) : undefined;
  }

  private stripConnectorRuntimeMetadata(state: InternalRunState): void {
    if (!state.run.metadata || !('connectorRuntime' in state.run.metadata)) {
      return;
    }
    const { connectorRuntime: _connectorRuntime, ...rest } = state.run.metadata;
    state.run.metadata = Object.keys(rest).length > 0 ? rest : undefined;
  }

  private async persistState(state: InternalRunState): Promise<void> {
    this.stripConnectorRuntimeMetadata(state);
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

  private buildWorkflowEnvelope(state: InternalRunState, node: WorkflowNodeSpec): WorkflowRuntimeContextEnvelope {
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

  private isConnectorExecutor(node: WorkflowNodeSpec): boolean {
    return node.nodeType === 'executor' && node.executorId === 'connector-runtime';
  }

  private isNativePlatformExecutor(node: WorkflowNodeSpec): boolean {
    return getNativeExecutorId(node) !== undefined;
  }

  private getConnectorActionSnapshot(
    state: InternalRunState,
    node: WorkflowNodeSpec,
  ): ConnectorActionExecutionSnapshot {
    const actionRef = isRecord(node.config) && typeof node.config.actionRef === 'string'
      ? node.config.actionRef
      : undefined;
    if (!actionRef) {
      throw new RuntimeRequestError(409, 'CONNECTOR_ACTION_REF_REQUIRED', 'connector executor node requires config.actionRef');
    }
    const snapshots = getConnectorActionSnapshots(state.run.metadata?.connectorActions);
    const action = snapshots[actionRef];
    if (!action) {
      throw new RuntimeRequestError(409, 'CONNECTOR_ACTION_NOT_BOUND', `connector action binding not found for actionRef ${actionRef}`);
    }
    return action;
  }

  private findConnectorActionSession(
    state: InternalRunState,
    params: {
      connectorActionSessionId?: string;
      nodeRunId?: string;
      externalSessionRef?: string;
    },
  ): ConnectorActionSessionRecord | undefined {
    return [...state.connectorActionSessions]
      .reverse()
      .find((item) => (
        (!params.connectorActionSessionId || item.connectorActionSessionId === params.connectorActionSessionId)
        && (!params.nodeRunId || item.nodeRunId === params.nodeRunId)
        && (!params.externalSessionRef || item.externalSessionRef === params.externalSessionRef)
      ));
  }

  private findConnectorActionForSession(
    state: InternalRunState,
    session: ConnectorActionSessionRecord,
  ): ConnectorActionExecutionSnapshot | undefined {
    return Object.values(getConnectorActionSnapshots(state.run.metadata?.connectorActions))
      .find((item) => item.actionBindingId === session.actionBindingId);
  }

  private resolveConnectorActionSessionFromState(
    state: InternalRunState,
    publicCallbackKey: string,
  ): { state: InternalRunState; session: ConnectorActionSessionRecord; action: ConnectorActionExecutionSnapshot } | undefined {
    const session = state.connectorActionSessions.find((item) => item.publicCallbackKey === publicCallbackKey);
    if (!session) {
      return undefined;
    }
    const action = this.findConnectorActionForSession(state, session);
    if (!action) {
      throw new RuntimeRequestError(
        409,
        'CONNECTOR_ACTION_NOT_BOUND',
        `connector action binding snapshot not found for session ${session.connectorActionSessionId}`,
      );
    }
    return { state, session, action };
  }

  private async resolveConnectorActionSessionByPublicCallbackKey(
    publicCallbackKey: string,
  ): Promise<{ state: InternalRunState; session: ConnectorActionSessionRecord; action: ConnectorActionExecutionSnapshot } | undefined> {
    for (const state of this.store.listRuns()) {
      const resolved = this.resolveConnectorActionSessionFromState(state, publicCallbackKey);
      if (resolved) {
        return resolved;
      }
    }
    if (!this.repository) {
      return undefined;
    }
    const persisted = await this.repository.findRunStateByConnectorPublicCallbackKey(publicCallbackKey);
    if (!persisted) {
      return undefined;
    }
    this.store.createRun(persisted);
    return this.resolveConnectorActionSessionFromState(persisted, publicCallbackKey);
  }

  private buildNativeEmitArtifactPayload(
    nodeRun: WorkflowNodeRunRecord,
    config: NativeEmitArtifactConfig,
  ): Record<string, unknown> {
    if (config.payloadMode === 'static') {
      return config.staticPayload ? { ...config.staticPayload } : {};
    }
    return nodeRun.inputJson ? { ...nodeRun.inputJson } : {};
  }

  private async completeNodeWithSuccessTransition(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    node: WorkflowNodeSpec,
    traceId: string,
    events: WorkflowFormalEvent[],
    nextInput?: Record<string, unknown>,
  ): Promise<WorkflowFormalEvent[]> {
    const timestamp = this.now();
    nodeRun.status = 'completed';
    nodeRun.updatedAt = timestamp;
    events.push(this.buildNodeStateEvent(traceId, state.run, nodeRun, 'completed'));
    if (node.transitions?.success) {
      const tail = await this.advanceToNode(
        state,
        node.transitions.success,
        traceId,
        { payload: nextInput },
        new Set<string>([nodeRun.nodeKey]),
        false,
      );
      return [...events, ...tail];
    }
    state.run.status = 'completed';
    state.run.updatedAt = timestamp;
    state.run.completedAt = timestamp;
    events.push(this.buildRunStateEvent(traceId, state.run, 'completed'));
    return events;
  }

  private async executeNativePlatformNode(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    node: WorkflowNodeSpec,
    traceId: string,
  ): Promise<WorkflowFormalEvent[]> {
    const executorId = getNativeExecutorId(node);
    if (!executorId) {
      throw new RuntimeRequestError(409, 'NATIVE_EXECUTOR_INVALID', `native executor not supported: ${node.executorId}`);
    }

    if (executorId === 'platform.emit_artifact') {
      const config = getNativeEmitArtifactConfig(node);
      const artifact = this.createArtifact(
        state,
        nodeRun,
        config.artifactType,
        config.state,
        this.buildNativeEmitArtifactPayload(nodeRun, config),
        config.metadataJson,
        config.schemaRef,
      );
      const events: WorkflowFormalEvent[] = [{
        schemaVersion: 'v1',
        eventId: this.uuid(),
        traceId,
        runId: state.run.runId,
        timestampMs: this.now(),
        kind: 'artifact.created',
        payload: {
          artifactId: artifact.artifactId,
          artifactType: artifact.artifactType,
          state: artifact.state,
        },
      }];
      return await this.completeNodeWithSuccessTransition(state, nodeRun, node, traceId, events, artifact.payloadJson);
    }

    if (executorId === 'platform.request_interaction') {
      const config = getNativeRequestInteractionConfig(node);
      const timestamp = this.now();
      this.cancelPendingInteractionRequests(state, nodeRun.nodeRunId, timestamp);
      const interactionRequest: WorkflowInteractionRequestRecord = {
        interactionRequestId: this.uuid(),
        runId: state.run.runId,
        nodeRunId: nodeRun.nodeRunId,
        status: 'pending',
        prompt: config.prompt,
        answerSchemaJson: { ...config.answerSchemaJson },
        uiSchemaJson: { ...config.uiSchemaJson },
        payloadJson: config.payloadJson ? { ...config.payloadJson } : undefined,
        metadataJson: {
          ...(config.metadataJson || {}),
          nativePlatformExecutorId: executorId,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.interactionRequests.push(interactionRequest);
      nodeRun.status = 'waiting_interaction';
      nodeRun.interactionRequestId = interactionRequest.interactionRequestId;
      nodeRun.waitKey = interactionRequest.interactionRequestId;
      nodeRun.updatedAt = timestamp;
      nodeRun.metadata = {
        ...(nodeRun.metadata || {}),
        nativePlatformExecutorId: executorId,
      };
      state.run.status = 'waiting_interaction';
      state.run.updatedAt = timestamp;
      return [
        this.buildNodeStateEvent(traceId, state.run, nodeRun, 'waiting_interaction'),
        this.buildRunStateEvent(traceId, state.run, 'waiting_interaction'),
        {
          schemaVersion: 'v1',
          eventId: this.uuid(),
          traceId,
          runId: state.run.runId,
          timestampMs: timestamp,
          kind: 'interaction.requested',
          payload: {
            interactionRequestId: interactionRequest.interactionRequestId,
            nodeRunId: interactionRequest.nodeRunId || nodeRun.nodeRunId,
            nodeKey: nodeRun.nodeKey,
            prompt: interactionRequest.prompt,
            answerSchema: interactionRequest.answerSchemaJson,
            uiSchema: interactionRequest.uiSchemaJson,
            metadata: interactionRequest.metadataJson,
          },
        },
      ];
    }

    const config = getNativeFailConfig(node);
    const timestamp = this.now();
    nodeRun.status = 'failed';
    nodeRun.updatedAt = timestamp;
    nodeRun.metadata = {
      ...(nodeRun.metadata || {}),
      nativeFailure: {
        ...(config.code ? { code: config.code } : {}),
        ...(config.message ? { message: config.message } : {}),
        ...(config.metadataJson ? { metadata: config.metadataJson } : {}),
      },
    };
    state.run.status = 'failed';
    state.run.updatedAt = timestamp;
    state.run.metadata = {
      ...(state.run.metadata || {}),
      nativeFailure: {
        ...(config.code ? { code: config.code } : {}),
        ...(config.message ? { message: config.message } : {}),
      },
    };
    return [
      this.buildNodeStateEvent(traceId, state.run, nodeRun, 'failed'),
      this.buildRunStateEvent(traceId, state.run, 'failed'),
    ];
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
        timestampMs: this.now(),
        kind: 'approval.requested',
        payload: {
          approvalRequestId: approval.approvalRequestId,
          nodeRunId: nodeRun.nodeRunId,
          prompt: '等待审批后继续执行。',
        },
      });
      return events;
    }

    if (this.isConnectorExecutor(node)) {
      if (fromResume) {
        return events;
      }
      const connectorEvents = await this.invokeConnectorRuntime(
        state,
        nodeRun,
        node,
        traceId,
        initialInput.text,
        initialInput.payload,
      );
      return [...events, ...connectorEvents];
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

    if (this.isNativePlatformExecutor(node)) {
      if (fromResume) {
        return events;
      }
      const nativeEvents = await this.executeNativePlatformNode(state, nodeRun, node, traceId);
      return [...events, ...nativeEvents];
    }

    throw new RuntimeRequestError(
      409,
      'EXECUTOR_NOT_SUPPORTED',
      `executor ${node.executorId || node.nodeKey} is not available in pure v1 runtime`,
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
        if (reviewArtifactIds.includes(artifact.artifactId) && artifact.state === 'review_required') {
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
        timestampMs: this.now(),
        kind: 'approval.decided',
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
    const node = findNode(state.version.spec, nodeRun.nodeKey);
    if (this.isConnectorExecutor(node)) {
      throw new RuntimeRequestError(
        409,
        'CONNECTOR_RESUME_UNSUPPORTED',
        'connector executor nodes are resumed by connector callbacks, not user-driven resume',
      );
    }
    if (this.getExternalRuntimeBridge(state)) {
      nodeRun.attempt += 1;
      return await this.resumeExternalBridgeNode(state, nodeRun, traceId);
    }
    if (this.isNativePlatformExecutor(node)) {
      nodeRun.attempt += 1;
      return await this.resumeNativePlatformNode(state, nodeRun, node, traceId, request);
    }
    throw new RuntimeRequestError(
      409,
      'EXECUTOR_RESUME_UNSUPPORTED',
      `executor ${node.executorId || node.nodeKey} does not support pure v1 resume`,
    );
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
    for (const session of state.connectorActionSessions) {
      if (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled') {
        continue;
      }
      session.status = 'cancelled';
      session.cancelledAt = timestamp;
      session.updatedAt = timestamp;
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

  private async resumeNativePlatformNode(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    node: WorkflowNodeSpec,
    traceId: string,
    request: WorkflowRuntimeResumeRunRequest,
  ): Promise<WorkflowFormalEvent[]> {
    const executorId = getNativeExecutorId(node);
    if (executorId !== 'platform.request_interaction') {
      throw new RuntimeRequestError(
        409,
        'NATIVE_RESUME_UNSUPPORTED',
        `native executor ${node.executorId} does not support interaction resume`,
      );
    }

    const interactionRequest = state.interactionRequests.find((item) => item.interactionRequestId === request.interactionRequestId);
    if (!interactionRequest || interactionRequest.nodeRunId !== nodeRun.nodeRunId) {
      throw new RuntimeRequestError(404, 'INTERACTION_REQUEST_NOT_FOUND', 'interaction request not found for current node');
    }
    if (interactionRequest.status !== 'pending') {
      throw new RuntimeRequestError(409, 'INTERACTION_REQUEST_NOT_PENDING', 'interaction request is not pending');
    }

    const config = getNativeRequestInteractionConfig(node);
    const timestamp = this.now();
    interactionRequest.status = 'answered';
    interactionRequest.responsePayloadJson = request.payload ? { ...request.payload } : {};
    interactionRequest.respondedAt = timestamp;
    interactionRequest.updatedAt = timestamp;
    nodeRun.updatedAt = timestamp;

    const events: WorkflowFormalEvent[] = [{
      schemaVersion: 'v1',
      eventId: this.uuid(),
      traceId,
      runId: state.run.runId,
      timestampMs: timestamp,
      kind: 'interaction.responded',
      payload: {
        interactionRequestId: request.interactionRequestId,
        nodeRunId: nodeRun.nodeRunId,
        responsePayload: request.payload,
      },
    }];

    if (config.responseArtifactType) {
      const artifact = this.createArtifact(
        state,
        nodeRun,
        config.responseArtifactType,
        config.responseArtifactState || 'validated',
        {
          interactionRequestId: interactionRequest.interactionRequestId,
          prompt: interactionRequest.prompt,
          responsePayload: request.payload || {},
        },
        {
          nodeKey: nodeRun.nodeKey,
          source: 'interaction_response',
        },
        config.responseSchemaRef,
      );
      events.push({
        schemaVersion: 'v1',
        eventId: this.uuid(),
        traceId,
        runId: state.run.runId,
        timestampMs: this.now(),
        kind: 'artifact.created',
        payload: {
          artifactId: artifact.artifactId,
          artifactType: artifact.artifactType,
          state: artifact.state,
        },
      });
    }

    return await this.completeNodeWithSuccessTransition(
      state,
      nodeRun,
      node,
      traceId,
      events,
      request.payload,
    );
  }

  private cancelPendingApprovals(state: InternalRunState, nodeRunId?: string): void {
    const timestamp = this.now();
    for (const approval of state.approvals) {
      if (approval.status !== 'pending') continue;
      if (nodeRunId && approval.nodeRunId !== nodeRunId) continue;
      approval.status = 'cancelled';
      approval.updatedAt = timestamp;
    }
    this.cancelPendingInteractionRequests(state, nodeRunId, timestamp);
  }

  private async invokeConnectorRuntime(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    node: WorkflowNodeSpec,
    traceId: string,
    inputText?: string,
    inputPayload?: Record<string, unknown>,
  ): Promise<WorkflowFormalEvent[]> {
    const action = this.getConnectorActionSnapshot(state, node);
    const workspaceId = typeof state.run.metadata?.runtimeMetadata === 'object'
      && state.run.metadata?.runtimeMetadata
      && typeof (state.run.metadata.runtimeMetadata as Record<string, unknown>).workspaceId === 'string'
        ? String((state.run.metadata.runtimeMetadata as Record<string, unknown>).workspaceId)
        : 'workspace';
    const payload = {
      ...(inputPayload || {}),
      ...(inputText ? { text: inputText } : {}),
      __workflow: this.buildWorkflowEnvelope(state, node),
    };
    const timestamp = this.now();

    try {
      const response = await this.connectorRuntimeClient.invoke({
        schemaVersion: 'v1',
        traceId,
        workspaceId,
        runId: state.run.runId,
        nodeRunId: nodeRun.nodeRunId,
        sessionId: state.run.sessionId,
        userId: state.run.userId,
        action,
        inputPayload: payload,
        callback: {
          url: '/internal/runtime/connector-callback',
        },
        metadata: {
          sourceType: typeof state.run.metadata?.sourceType === 'string' ? state.run.metadata.sourceType : undefined,
          sourceRef: typeof state.run.metadata?.sourceRef === 'string' ? state.run.metadata.sourceRef : undefined,
          runtimeMetadata: isRecord(state.run.metadata?.runtimeMetadata)
            ? state.run.metadata.runtimeMetadata as Record<string, unknown>
            : undefined,
        },
      });

      if (response.status === 'completed') {
        return await this.applyConnectorResult(
          state,
          nodeRun,
          node,
          traceId,
          response.externalSessionRef,
          response.result,
        );
      }

      const connectorActionSessionId = isRecord(response.metadata) && typeof response.metadata.connectorActionSessionId === 'string'
        ? response.metadata.connectorActionSessionId
        : this.uuid();
      const session: ConnectorActionSessionRecord = {
        connectorActionSessionId,
        runId: state.run.runId,
        nodeRunId: nodeRun.nodeRunId,
        actionBindingId: action.actionBindingId,
        connectorBindingId: action.connectorBindingId,
        capabilityId: action.capabilityId,
        externalSessionRef: response.externalSessionRef,
        publicCallbackKey: response.publicCallbackKey,
        status: 'waiting_callback',
        lastSequence: 0,
        metadataJson: isRecord(response.metadata) ? response.metadata : undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.connectorActionSessions.push(session);
      nodeRun.metadata = {
        ...(nodeRun.metadata || {}),
        connectorActionSessionId: session.connectorActionSessionId,
        publicCallbackKey: response.publicCallbackKey,
        externalSessionRef: response.externalSessionRef,
      };
      nodeRun.updatedAt = timestamp;
      return [];
    } catch (error) {
      nodeRun.status = 'failed';
      nodeRun.updatedAt = timestamp;
      nodeRun.metadata = {
        ...(nodeRun.metadata || {}),
        connectorError: serializeError(error),
      };
      state.run.status = 'failed';
      state.run.updatedAt = timestamp;
      return [
        this.buildNodeStateEvent(traceId, state.run, nodeRun, 'failed'),
        this.buildRunStateEvent(traceId, state.run, 'failed'),
      ];
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
  ): Promise<WorkflowFormalEvent[]> {
    throw new RuntimeRequestError(
      409,
      'EXTERNAL_RUNTIME_INTERACTION_UNSUPPORTED',
      'external runtime nodes are resumed by bridge callbacks or approval decisions, not interaction responses',
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
        timestampMs: timestamp,
        kind: 'approval.decided',
        payload: {
          approvalRequestId: approval.approvalRequestId,
          decision: decision.decision,
        },
      },
      this.buildNodeStateEvent(traceId, state.run, nodeRun, 'running'),
      this.buildRunStateEvent(traceId, state.run, 'running'),
    ];
  }

  private async applyConnectorResult(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    node: WorkflowNodeSpec,
    traceId: string,
    externalSessionRef: string,
    result: WorkflowLedgerResult | undefined,
  ): Promise<WorkflowFormalEvent[]> {
    const timestamp = this.now();
    nodeRun.status = 'completed';
    nodeRun.updatedAt = timestamp;
    this.cancelPendingApprovals(state, nodeRun.nodeRunId);
    const ledgerResult = normalizeLedgerResult(result);
    const createdArtifacts = this.createArtifactsFromLedgerResult(state, nodeRun, ledgerResult);
    this.applyLedgerResult(state, ledgerResult);
    if (createdArtifacts.length === 0) {
      createdArtifacts.push(this.createArtifact(
        state,
        nodeRun,
        'ActionReceipt',
        'validated',
        {
          externalSessionRef,
          nodeKey: nodeRun.nodeKey,
        },
      ));
    }

    const events: WorkflowFormalEvent[] = [
      this.buildNodeStateEvent(traceId, state.run, nodeRun, 'completed'),
    ];
    for (const artifact of createdArtifacts) {
      events.push({
        schemaVersion: 'v1',
        eventId: this.uuid(),
        traceId,
        runId: state.run.runId,
        timestampMs: timestamp,
        kind: 'artifact.created',
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
        traceId,
        {},
        new Set<string>([nodeRun.nodeKey]),
        false,
      );
      return [...events, ...tail];
    }
    state.run.status = 'completed';
    state.run.updatedAt = timestamp;
    state.run.completedAt = timestamp;
    events.push(this.buildRunStateEvent(traceId, state.run, 'completed'));
    return events;
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
      return [];
    }

    if (request.kind === 'approval.requested') {
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
          timestampMs: timestamp,
          kind: 'approval.requested',
          payload: {
            approvalRequestId: approval.approvalRequestId,
            nodeRunId: nodeRun.nodeRunId,
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
      const ledgerResult = normalizeLedgerResult(payload);
      const createdArtifacts = this.createArtifactsFromLedgerResult(state, nodeRun, ledgerResult);
      this.applyLedgerResult(state, ledgerResult);
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
          timestampMs: timestamp,
          kind: 'artifact.created',
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

  private cancelPendingInteractionRequests(
    state: InternalRunState,
    nodeRunId?: string,
    timestamp = this.now(),
  ): void {
    for (const interactionRequest of state.interactionRequests) {
      if (interactionRequest.status !== 'pending') continue;
      if (nodeRunId && interactionRequest.nodeRunId !== nodeRunId) continue;
      interactionRequest.status = 'cancelled';
      interactionRequest.updatedAt = timestamp;
    }
  }

  private createApprovalRequest(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    node: WorkflowNodeSpec,
  ): WorkflowApprovalRequestRecord {
    const reviewArtifactTypes = Array.isArray(node.config?.reviewArtifactTypes)
      ? node.config?.reviewArtifactTypes.map((item) => String(item))
      : [];
    const reviewArtifacts = reviewArtifactTypes.length > 0
      ? state.artifacts.filter((artifact) => reviewArtifactTypes.includes(artifact.artifactType))
      : state.artifacts.filter((artifact) => artifact.state === 'review_required');
    const runInput = this.getRunInputPayload(state);
    const requestedActorId = isRecord(runInput?.reviewerActor) && typeof runInput?.reviewerActor.actorId === 'string'
      ? runInput.reviewerActor.actorId
      : state.run.userId;
    const approval: WorkflowApprovalRequestRecord = {
      approvalRequestId: this.uuid(),
      runId: state.run.runId,
      nodeRunId: nodeRun.nodeRunId,
      artifactId: reviewArtifacts[0]?.artifactId,
      status: 'pending',
      requestedActorId,
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

  private createArtifactsFromLedgerResult(
    state: InternalRunState,
    nodeRun: WorkflowNodeRunRecord,
    result: WorkflowLedgerResult,
  ): WorkflowArtifactRecord[] {
    const artifacts: WorkflowArtifactRecord[] = [];
    for (const seed of result.artifacts || []) {
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
    this.resolveArtifactReferences(artifacts);
    return artifacts;
  }

  private resolveArtifactReferences(artifacts: WorkflowArtifactRecord[]): void {
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

  private applyLedgerResult(
    state: InternalRunState,
    result: WorkflowLedgerResult,
  ): void {
    for (const seed of result.actorProfiles || []) {
      this.upsertActorProfile(state, seed);
    }
    for (const seed of result.actorMemberships || []) {
      this.upsertActorMembership(state, seed);
    }
    if (result.audienceSelector) {
      this.upsertAudienceSelector(state, result.audienceSelector);
    }
    if (result.deliverySpec) {
      this.upsertDeliverySpec(state, result.deliverySpec);
    }
    for (const seed of result.deliveryTargets || []) {
      this.upsertDeliveryTarget(state, seed);
    }
  }

  private upsertActorProfile(
    state: InternalRunState,
    seed: WorkflowActorProfileSeed,
  ): void {
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

  private upsertActorMembership(
    state: InternalRunState,
    seed: WorkflowActorMembershipSeed,
  ): void {
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

  private upsertAudienceSelector(
    state: InternalRunState,
    seed: WorkflowAudienceSelectorSeed,
  ): void {
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

  private upsertDeliverySpec(
    state: InternalRunState,
    seed: WorkflowDeliverySpecSeed,
  ): void {
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

  private upsertDeliveryTarget(
    state: InternalRunState,
    seed: WorkflowDeliveryTargetSeed,
  ): void {
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

  private buildExternalReceiptEvent(
    traceId: string,
    runId: string,
    params: {
      nodeRunId?: string;
      bridgeId?: string;
      bridgeSessionId?: string;
      connectorActionSessionId?: string;
      connectorEventReceiptId?: string;
      eventSubscriptionId?: string;
      callbackKind: string;
      externalSessionRef?: string;
      receiptSourceKind: 'bridge_callback' | 'connector_action_callback' | 'event_subscription';
      metadata?: Record<string, unknown>;
    },
  ): WorkflowFormalEvent {
    return {
      schemaVersion: 'v1',
      eventId: this.uuid(),
      traceId,
      runId,
      timestampMs: this.now(),
      kind: 'external.callback.received',
      payload: {
        ...(params.nodeRunId ? { nodeRunId: params.nodeRunId } : {}),
        ...(params.bridgeId ? { bridgeId: params.bridgeId } : {}),
        ...(params.bridgeSessionId ? { bridgeSessionId: params.bridgeSessionId } : {}),
        ...(params.connectorActionSessionId ? { connectorActionSessionId: params.connectorActionSessionId } : {}),
        ...(params.connectorEventReceiptId ? { connectorEventReceiptId: params.connectorEventReceiptId } : {}),
        ...(params.eventSubscriptionId ? { eventSubscriptionId: params.eventSubscriptionId } : {}),
        callbackKind: params.callbackKind,
        ...(params.externalSessionRef ? { externalSessionRef: params.externalSessionRef } : {}),
        receiptSourceKind: params.receiptSourceKind,
        ...(params.metadata ? { metadata: params.metadata } : {}),
      },
    };
  }

  private async persistExternalReceiptEvent(
    traceId: string,
    state: InternalRunState,
    params: {
      nodeRunId?: string;
      bridgeId?: string;
      bridgeSessionId?: string;
      connectorActionSessionId?: string;
      connectorEventReceiptId?: string;
      eventSubscriptionId?: string;
      callbackKind: string;
      externalSessionRef?: string;
      receiptSourceKind: 'bridge_callback' | 'connector_action_callback' | 'event_subscription';
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.persistState(state);
    await this.enqueueFormalEvents(traceId, state, [
      this.buildExternalReceiptEvent(traceId, state.run.runId, params),
    ]);
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
      timestampMs: this.now(),
      kind: 'run.lifecycle',
      payload: {
        status,
        startMode: run.startMode,
        agentId: run.agentId,
      },
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
      timestampMs: this.now(),
      kind: 'node.lifecycle',
      payload: {
        nodeRunId: nodeRun.nodeRunId,
        nodeKey: nodeRun.nodeKey,
        nodeType: nodeRun.nodeType,
        status,
        executionPolicy: nodeRun.executionPolicy,
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
