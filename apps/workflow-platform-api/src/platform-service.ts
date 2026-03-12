import type {
  AgentRunStartRequest,
  AgentDefinitionCreateRequest,
  AgentDefinitionLifecycleRequest,
  AgentDefinitionListResponse,
  AgentDefinitionRecord,
  AgentDefinitionResponse,
  BridgeHealth,
  BridgeManifest,
  BridgeRegistrationCreateRequest,
  BridgeRegistrationLifecycleRequest,
  BridgeRegistrationListResponse,
  BridgeRegistrationRecord,
  BridgeRegistrationResponse,
  WorkflowApprovalDecisionRequest,
  WorkflowApprovalDecisionResponse,
  WorkflowApprovalDetailResponse,
  WorkflowApprovalQueueResponse,
  DueScheduleTriggerListResponse,
  DraftRevisionRecord,
  DraftSource,
  DraftValidationSummary,
  GovernanceChangeDecisionRequest,
  GovernanceChangeDecisionRecord,
  GovernanceChangeDecisionResponse,
  GovernanceChangeRequestCreateRequest,
  GovernanceChangeRequestDetailResponse,
  GovernanceChangeRequestListResponse,
  GovernanceChangeRequestRecord,
  GovernanceChangeRequestResponse,
  PolicyBindingCreateRequest,
  PolicyBindingListResponse,
  PolicyBindingRecord,
  PolicyBindingResponse,
  RecipeDraftCreateRequest,
  RecipeDraftRecord,
  RecipeDraftStatus,
  RecipeDraftUpdateRequest,
  ScopeGrantListResponse,
  ScopeGrantRecord,
  SecretRefCreateRequest,
  SecretRefListResponse,
  SecretRefRecord,
  SecretRefResponse,
  TriggerBindingCreateRequest,
  TriggerBindingLifecycleRequest,
  TriggerBindingListResponse,
  TriggerBindingRecord,
  TriggerBindingResponse,
  TriggerDispatchRecord,
  TriggerDispatchRequest,
  TriggerDispatchResponse,
  WebhookTriggerRuntimeConfigResponse,
  WorkflowRunCancelRequest,
  WorkflowDraftCreateRequest,
  WorkflowDraftDetailResponse,
  WorkflowDraftFocusRequest,
  WorkflowDraftFocusResponse,
  WorkflowDraftIntakeRequest,
  WorkflowDraftListResponse,
  WorkflowDraftMutateResponse,
  WorkflowDraftPublishRequest,
  WorkflowDraftPublishResponse,
  WorkflowDraftRecord,
  WorkflowDraftSessionLinkRecord,
  WorkflowDraftSpecPatchRequest,
  WorkflowDraftSpecPatchResponse,
  WorkflowDraftSpec,
  WorkflowDraftStatus,
  WorkflowArtifactDetailResponse,
  WorkflowArtifactRecord,
  WorkflowCommandResponse,
  WorkflowResumeRequest,
  WorkflowRunListResponse,
  WorkflowRunQueryResponse,
  WorkflowRunSnapshot,
  WorkflowRuntimeCancelRunRequest,
  WorkflowRuntimeResumeRunRequest,
  WorkflowRuntimeStartRunRequest,
  WorkflowStartRequest,
  WorkflowTemplateRecord,
  WorkflowTemplateSpec,
  WorkflowTemplateVersionRecord,
} from '@baseinterface/workflow-contracts';
import { isWorkflowDraftTerminal } from '@baseinterface/workflow-contracts';
import type { ExternalBridgeClient } from '@baseinterface/executor-sdk';
import {
  canApplyApprovedChange,
  isSecretUsable,
  isTriggerRunnable,
  requiresGovernanceApproval,
} from '@baseinterface/policy-sdk';
import type { RuntimeClient } from './runtime-client';
import type { GovernanceRepository } from './governance-repository';
import {
  computeNextScheduleTriggerAt,
  getWebhookDedupeHeader,
  getWebhookReplayWindowMs,
  getWebhookSignatureHeader,
  getWebhookTimestampHeader,
  normalizeRecord,
  normalizeString,
  normalizeStringArray,
} from './governance-utils';
import { PlatformError } from './platform-errors';
import type { PlatformRepository, WorkflowDetail } from './platform-repository';

type PlatformServiceDeps = {
  repository: PlatformRepository;
  governanceRepository: GovernanceRepository;
  runtimeClient: RuntimeClient;
  externalBridgeClient: ExternalBridgeClient;
  runtimePublicBaseUrl: string;
  now: () => number;
  uuid: () => string;
};

function sanitizeText(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Array.isArray(value) === false;
}

function toBridgeMetadataError(error: unknown): PlatformError {
  if (error instanceof PlatformError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new PlatformError(
    502,
    message.includes('response invalid') ? 'BRIDGE_METADATA_INVALID' : 'BRIDGE_METADATA_FETCH_FAILED',
    message || 'bridge metadata request failed',
  );
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function buildDefaultName(draftId: string, requirements: string[]): string {
  const first = requirements[0];
  if (first) {
    return first.slice(0, 48);
  }
  return `Builder Draft ${draftId.slice(0, 8)}`;
}

function buildDefaultWorkflowKey(name: string, draftId: string): string {
  const slug = slugify(name);
  return slug || `builder-${draftId.slice(0, 8)}`;
}

function normalizeRequirements(spec: WorkflowDraftSpec): string[] {
  return Array.isArray(spec.requirements)
    ? spec.requirements.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function cloneSpec(spec: WorkflowDraftSpec): WorkflowDraftSpec {
  return JSON.parse(JSON.stringify(spec)) as WorkflowDraftSpec;
}

function applyDraftSpecPatch(spec: WorkflowDraftSpec, patch: WorkflowDraftSpecPatchRequest['patch']): WorkflowDraftSpec {
  const next = cloneSpec(spec);
  if (patch.section === 'metadata') {
    if ('workflowKey' in patch.value) {
      next.workflowKey = sanitizeText(patch.value.workflowKey);
    }
    if ('name' in patch.value) {
      next.name = sanitizeText(patch.value.name);
    }
    if ('compatProviderId' in patch.value) {
      next.compatProviderId = sanitizeText(patch.value.compatProviderId);
    }
    if ('entryNode' in patch.value) {
      next.entryNode = sanitizeText(patch.value.entryNode);
    }
    return next;
  }

  if (patch.section === 'requirements') {
    next.requirements = patch.value.requirements.map((item) => String(item).trim()).filter(Boolean);
    return next;
  }

  next.entryNode = sanitizeText(patch.value.entryNode) || next.entryNode;
  next.nodes = patch.value.nodes.map((node) => ({
    ...node,
    config: node.config ? { ...node.config } : undefined,
    transitions: node.transitions ? { ...node.transitions } : undefined,
  }));
  return next;
}

function buildInitialSpec(input: WorkflowDraftCreateRequest, draftId: string): WorkflowDraftSpec {
  const requirements = input.initialText ? [input.initialText.trim()] : [];
  const name = sanitizeText(input.name);
  const workflowKey = sanitizeText(input.workflowKey);
  return {
    schemaVersion: 'v1',
    workflowKey,
    name,
    metadata: {
      builder: {
        createdFrom: input.source || (input.initialText ? 'builder_text_entry' : 'builder_quick_entry'),
        draftId,
      },
    },
    requirements,
  };
}

function buildSynthesizedSpec(draft: WorkflowDraftRecord): WorkflowDraftSpec {
  const next = cloneSpec(draft.currentSpec);
  const requirements = normalizeRequirements(next);
  const name = sanitizeText(next.name) || buildDefaultName(draft.draftId, requirements);
  const workflowKey = sanitizeText(next.workflowKey) || buildDefaultWorkflowKey(name, draft.draftId);
  const compatProviderId = sanitizeText(next.compatProviderId) || 'sample';
  const entryNode = sanitizeText(next.entryNode) || 'collect';
  const endNodeKey = 'finish';

  next.name = name;
  next.workflowKey = workflowKey;
  next.compatProviderId = compatProviderId;
  next.entryNode = entryNode;
  next.nodes = Array.isArray(next.nodes) && next.nodes.length > 0
    ? next.nodes
    : [
        {
          nodeKey: entryNode,
          nodeType: 'executor',
          executorId: `compat-${compatProviderId}`,
          transitions: {
            success: endNodeKey,
          },
          config: {
            requirements,
          },
        },
        {
          nodeKey: endNodeKey,
          nodeType: 'end',
        },
      ];
  next.metadata = {
    ...(next.metadata || {}),
    builder: {
      ...((next.metadata?.builder && typeof next.metadata.builder === 'object') ? next.metadata.builder : {}),
      requirements,
      synthesizedAt: new Date().toISOString(),
    },
  };
  next.requirements = requirements;
  return next;
}

function validateDraftSpec(spec: WorkflowDraftSpec, timestamp: number): DraftValidationSummary {
  const errors: string[] = [];
  const warnings: string[] = [];
  const workflowKey = sanitizeText(spec.workflowKey);
  const name = sanitizeText(spec.name);
  const compatProviderId = sanitizeText(spec.compatProviderId);
  const entryNode = sanitizeText(spec.entryNode);
  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];

  if (spec.schemaVersion !== 'v1') {
    errors.push('schemaVersion must be v1');
  }

  if (!workflowKey) {
    errors.push('workflowKey is required');
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workflowKey)) {
    errors.push('workflowKey must be kebab-case');
  }

  if (!name) {
    errors.push('name is required');
  }

  if (!compatProviderId) {
    errors.push('compatProviderId is required');
  }

  if (!entryNode) {
    errors.push('entryNode is required');
  }

  if (nodes.length === 0) {
    errors.push('at least one node is required');
  }

  const nodeKeys = new Set<string>();
  for (const node of nodes) {
    const nodeKey = sanitizeText(node.nodeKey);
    if (!nodeKey) {
      errors.push('every node requires nodeKey');
      continue;
    }
    if (nodeKeys.has(nodeKey)) {
      errors.push(`duplicate nodeKey: ${nodeKey}`);
    }
    nodeKeys.add(nodeKey);
    if (node.nodeType === 'executor' && !sanitizeText(node.executorId)) {
      errors.push(`executor node ${nodeKey} requires executorId`);
    }
  }

  if (entryNode && nodes.length > 0 && !nodeKeys.has(entryNode)) {
    errors.push(`entryNode ${entryNode} must exist in nodes`);
  }

  for (const node of nodes) {
    for (const nextNode of Object.values(node.transitions || {})) {
      if (nextNode && !nodeKeys.has(nextNode)) {
        errors.push(`transition from ${node.nodeKey} references missing node ${nextNode}`);
      }
    }
  }

  const requirements = normalizeRequirements(spec);
  if (requirements.length === 0) {
    warnings.push('no builder requirements captured yet');
  }

  return {
    isPublishable: errors.length === 0,
    errors,
    warnings,
    checkedAt: timestamp,
  };
}

function toTemplateSpec(spec: WorkflowDraftSpec): WorkflowTemplateSpec {
  return {
    schemaVersion: 'v1',
    workflowKey: String(spec.workflowKey),
    name: String(spec.name),
    compatProviderId: String(spec.compatProviderId),
    entryNode: String(spec.entryNode),
    nodes: Array.isArray(spec.nodes) ? spec.nodes : [],
    metadata: spec.metadata,
  };
}

function createDraftRevision(params: {
  uuid: () => string;
  timestamp: number;
  draftId: string;
  revisionNumber: number;
  source: DraftSource;
  actorId: string;
  changeSummary: string;
  specSnapshot: WorkflowDraftSpec;
  validationSummary?: DraftValidationSummary;
}): DraftRevisionRecord {
  return {
    revisionId: params.uuid(),
    draftId: params.draftId,
    revisionNumber: params.revisionNumber,
    source: params.source,
    actorId: params.actorId,
    changeSummary: params.changeSummary,
    specSnapshot: params.specSnapshot,
    validationSummary: params.validationSummary,
    createdAt: params.timestamp,
  };
}

function resolveDraftStatus(current: WorkflowDraftStatus, publishable: boolean): WorkflowDraftStatus {
  if (publishable) return 'publishable';
  if (current === 'created' || current === 'collecting_input') return 'editable';
  return 'editable';
}

export class PlatformService {
  private readonly repository: PlatformRepository;

  private readonly governanceRepository: GovernanceRepository;

  private readonly runtimeClient: RuntimeClient;

  private readonly externalBridgeClient: ExternalBridgeClient;

  private readonly runtimePublicBaseUrl: string;

  private readonly now: () => number;

  private readonly uuid: () => string;

  constructor(deps: PlatformServiceDeps) {
    this.repository = deps.repository;
    this.governanceRepository = deps.governanceRepository;
    this.runtimeClient = deps.runtimeClient;
    this.externalBridgeClient = deps.externalBridgeClient;
    this.runtimePublicBaseUrl = deps.runtimePublicBaseUrl.replace(/\/$/, '');
    this.now = deps.now;
    this.uuid = deps.uuid;
  }

  async close(): Promise<void> {
    await this.repository.close();
    await this.governanceRepository.close();
  }

  async listWorkflows(): Promise<WorkflowTemplateRecord[]> {
    return await this.repository.listWorkflows();
  }

  async getWorkflow(workflowId: string): Promise<WorkflowDetail> {
    const workflow = await this.repository.getWorkflow(workflowId);
    if (!workflow) {
      throw new PlatformError(404, 'WORKFLOW_NOT_FOUND', 'workflow not found');
    }
    return workflow;
  }

  async startRun(body: WorkflowStartRequest): Promise<WorkflowCommandResponse> {
    const workflow = await this.repository.getWorkflowByKey(body.workflowKey);
    if (!workflow) {
      throw new PlatformError(404, 'WORKFLOW_KEY_NOT_FOUND', 'workflow key not found');
    }
    const version = body.templateVersionId
      ? await this.repository.getVersion(body.templateVersionId)
      : await this.repository.getLatestVersion(body.workflowKey);
    if (!version) {
      throw new PlatformError(404, 'WORKFLOW_VERSION_NOT_FOUND', 'workflow version not found');
    }
    const response = await this.runtimeClient.startRun({
      schemaVersion: 'v1',
      traceId: body.traceId,
      sessionId: body.sessionId,
      userId: body.userId,
      template: workflow,
      version,
      inputText: body.inputText,
      inputPayload: body.inputPayload,
    } satisfies WorkflowRuntimeStartRunRequest);
    return await this.attachCapturedRecipeDrafts(response);
  }

  async resumeRun(body: WorkflowResumeRequest): Promise<WorkflowCommandResponse> {
    const response = await this.runtimeClient.resumeRun({
      schemaVersion: 'v1',
      traceId: body.traceId,
      sessionId: body.sessionId,
      userId: body.userId,
      runId: body.runId,
      compatProviderId: '',
      actionId: body.actionId,
      replyToken: body.replyToken,
      taskId: body.taskId,
      payload: body.payload,
    } satisfies WorkflowRuntimeResumeRunRequest);
    return await this.attachCapturedRecipeDrafts(response);
  }

  async getRun(runId: string): Promise<WorkflowRunQueryResponse> {
    const response = await this.runtimeClient.getRun(runId);
    return {
      ...response,
      capturedRecipeDrafts: await this.captureRunDerivedRecipeDrafts(response.run),
    };
  }

  async listRuns(limit = 25): Promise<WorkflowRunListResponse> {
    return await this.runtimeClient.listRuns(limit);
  }

  async listApprovals(): Promise<Record<string, unknown>> {
    return await this.runtimeClient.listApprovals();
  }

  async listApprovalQueue(): Promise<WorkflowApprovalQueueResponse> {
    return await this.runtimeClient.listApprovalQueue();
  }

  async getApprovalDetail(approvalRequestId: string): Promise<WorkflowApprovalDetailResponse> {
    return await this.runtimeClient.getApprovalDetail(approvalRequestId);
  }

  async decideApproval(
    approvalRequestId: string,
    input: WorkflowApprovalDecisionRequest,
  ): Promise<WorkflowApprovalDecisionResponse> {
    const response = await this.runtimeClient.decideApproval(approvalRequestId, input);
    return {
      ...response,
      capturedRecipeDrafts: await this.captureRunDerivedRecipeDrafts(response.run),
    };
  }

  async getArtifact(artifactId: string): Promise<WorkflowArtifactDetailResponse> {
    return await this.runtimeClient.getArtifact(artifactId);
  }

  async listBridgeRegistrations(): Promise<BridgeRegistrationListResponse> {
    return {
      schemaVersion: 'v1',
      bridges: await this.governanceRepository.listBridgeRegistrations(),
    };
  }

  async getBridgeRegistration(bridgeId: string): Promise<BridgeRegistrationResponse> {
    return {
      schemaVersion: 'v1',
      bridge: await this.requireBridgeRegistration(bridgeId),
    };
  }

  async createBridgeRegistration(input: BridgeRegistrationCreateRequest): Promise<BridgeRegistrationResponse> {
    const baseUrl = sanitizeText(input.baseUrl)?.replace(/\/$/, '');
    const serviceId = sanitizeText(input.serviceId);
    if (!baseUrl) {
      throw new PlatformError(400, 'BRIDGE_BASE_URL_REQUIRED', 'bridge baseUrl is required');
    }
    if (!serviceId) {
      throw new PlatformError(400, 'BRIDGE_SERVICE_ID_REQUIRED', 'bridge serviceId is required');
    }
    const bridgeRef = {
      bridgeId: this.uuid(),
      baseUrl,
      serviceId,
    };

    let manifest: BridgeManifest;
    let health: BridgeHealth;
    try {
      manifest = await this.externalBridgeClient.getManifest(bridgeRef);
      health = await this.externalBridgeClient.getHealth(bridgeRef);
    } catch (error) {
      throw toBridgeMetadataError(error);
    }
    const timestamp = this.now();
    const bridge = await this.governanceRepository.createBridgeRegistration({
      bridgeId: bridgeRef.bridgeId,
      workspaceId: input.workspaceId,
      name: sanitizeText(input.name) || 'External Runtime Bridge',
      description: sanitizeText(input.description),
      baseUrl: bridgeRef.baseUrl,
      serviceId: bridgeRef.serviceId,
      status: 'registered',
      runtimeType: 'external_agent_runtime',
      manifestJson: manifest,
      healthJson: health,
      authConfigJson: input.authConfigJson || {},
      callbackConfigJson: input.callbackConfigJson || {},
      lastHealthAt: health.checkedAt,
      createdBy: input.userId,
      updatedBy: input.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return {
      schemaVersion: 'v1',
      bridge,
    };
  }

  async activateBridgeRegistration(
    bridgeId: string,
    input: BridgeRegistrationLifecycleRequest,
  ): Promise<BridgeRegistrationResponse> {
    const bridge = await this.governanceRepository.runInTransaction(async (repository) => {
      await repository.lockBridgeRegistration(bridgeId);
      const current = await repository.getBridgeRegistration(bridgeId);
      if (!current) {
        throw new PlatformError(404, 'BRIDGE_NOT_FOUND', 'bridge not found');
      }
      let manifest: BridgeManifest;
      let health: BridgeHealth;
      try {
        manifest = await this.externalBridgeClient.getManifest(current);
        health = await this.externalBridgeClient.getHealth(current);
      } catch (error) {
        throw toBridgeMetadataError(error);
      }
      const timestamp = this.now();
      return await repository.updateBridgeRegistration({
        ...current,
        status: 'active',
        manifestJson: manifest,
        healthJson: health,
        lastHealthAt: health.checkedAt,
        updatedBy: input.userId,
        updatedAt: timestamp,
      });
    });
    return {
      schemaVersion: 'v1',
      bridge,
    };
  }

  async suspendBridgeRegistration(
    bridgeId: string,
    input: BridgeRegistrationLifecycleRequest,
  ): Promise<BridgeRegistrationResponse> {
    const bridge = await this.governanceRepository.runInTransaction(async (repository) => {
      await repository.lockBridgeRegistration(bridgeId);
      const current = await repository.getBridgeRegistration(bridgeId);
      if (!current) {
        throw new PlatformError(404, 'BRIDGE_NOT_FOUND', 'bridge not found');
      }
      return await repository.updateBridgeRegistration({
        ...current,
        status: 'suspended',
        updatedBy: input.userId,
        updatedAt: this.now(),
      });
    });
    return {
      schemaVersion: 'v1',
      bridge,
    };
  }

  async listAgents(): Promise<AgentDefinitionListResponse> {
    return {
      schemaVersion: 'v1',
      agents: await this.governanceRepository.listAgents(),
    };
  }

  async getAgent(agentId: string): Promise<AgentDefinitionResponse> {
    const agent = await this.governanceRepository.getAgent(agentId);
    if (!agent) {
      throw new PlatformError(404, 'AGENT_NOT_FOUND', 'agent not found');
    }
    return {
      schemaVersion: 'v1',
      agent,
    };
  }

  async createAgent(input: AgentDefinitionCreateRequest): Promise<AgentDefinitionResponse> {
    const version = await this.requirePublishedVersion(input.templateVersionRef);
    await this.validateAgentBridgeConfiguration(
      input.workspaceId,
      input.executorStrategy || 'platform_runtime',
      sanitizeText(input.bridgeId),
    );
    const timestamp = this.now();
    const agent: AgentDefinitionRecord = {
      agentId: this.uuid(),
      workspaceId: input.workspaceId,
      templateVersionRef: version.templateVersionId,
      name: sanitizeText(input.name) || `Agent ${version.workflowKey}`,
      description: sanitizeText(input.description),
      activationState: 'draft',
      bridgeId: sanitizeText(input.bridgeId),
      identityRef: sanitizeText(input.identityRef),
      executorStrategy: input.executorStrategy || 'platform_runtime',
      toolProfile: sanitizeText(input.toolProfile),
      riskLevel: input.riskLevel || 'R1',
      ownerActorRef: sanitizeText(input.ownerActorRef),
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return {
      schemaVersion: 'v1',
      agent: await this.governanceRepository.createAgent(agent),
    };
  }

  async startAgentRun(
    agentId: string,
    input: AgentRunStartRequest,
  ): Promise<WorkflowCommandResponse> {
    const agent = await this.requireAgent(agentId);
    if (agent.activationState !== 'active') {
      throw new PlatformError(409, 'AGENT_NOT_ACTIVE', 'agent must be active before starting a run');
    }
    const workflowVersion = await this.requirePublishedVersion(agent.templateVersionRef);
    const workflowDetail = await this.repository.getWorkflow(workflowVersion.workflowId);
    if (!workflowDetail) {
      throw new PlatformError(404, 'WORKFLOW_NOT_FOUND', 'workflow not found');
    }
    return await this.startManagedAgentRun({
      agent,
      workflowDetail,
      workflowVersion,
      traceId: input.traceId,
      sessionId: input.sessionId,
      userId: input.userId,
      inputText: input.inputText,
      inputPayload: input.inputPayload,
      sourceType: 'manual',
      sourceRef: agent.agentId,
      runtimeMetadata: {
        workspaceId: agent.workspaceId,
      },
    });
  }

  async cancelRun(body: WorkflowRunCancelRequest & { runId: string }): Promise<WorkflowCommandResponse> {
    const response = await this.runtimeClient.cancelRun({
      schemaVersion: 'v1',
      traceId: body.traceId,
      userId: body.userId,
      runId: body.runId,
      reason: sanitizeText(body.reason),
    } satisfies WorkflowRuntimeCancelRunRequest);
    return await this.attachCapturedRecipeDrafts(response);
  }

  async activateAgent(agentId: string, input: AgentDefinitionLifecycleRequest): Promise<AgentDefinitionResponse> {
    const agent = await this.requireAgent(agentId);
    const request = await this.createGovernanceChangeRequestRecord({
      workspaceId: agent.workspaceId,
      requestKind: 'agent_activate',
      targetType: 'agent_definition',
      targetRef: agent.agentId,
      requestedByActorId: input.userId,
      riskLevel: agent.riskLevel || 'R1',
      summary: sanitizeText(input.summary) || `Activate agent ${agent.name}`,
      justification: sanitizeText(input.justification),
      desiredStateJson: {
        activationState: 'active',
      },
    });
    return {
      schemaVersion: 'v1',
      agent,
      governanceRequest: request,
    };
  }

  async suspendAgent(agentId: string, input: AgentDefinitionLifecycleRequest): Promise<AgentDefinitionResponse> {
    const timestamp = this.now();
    const updated = await this.governanceRepository.runInTransaction(async (repository) => {
      await repository.lockAgent(agentId);
      const agent = await repository.getAgent(agentId);
      if (!agent) {
        throw new PlatformError(404, 'AGENT_NOT_FOUND', 'agent not found');
      }
      if (agent.activationState === 'retired' || agent.activationState === 'archived') {
        throw new PlatformError(409, 'AGENT_TERMINAL', 'agent is already terminal');
      }
      const next = await repository.updateAgent({
        ...agent,
        activationState: 'suspended',
        updatedBy: input.userId,
        updatedAt: timestamp,
      });
      await this.pauseScheduleTriggersForAgent(repository, agent.agentId, input.userId, timestamp);
      return next;
    });
    return {
      schemaVersion: 'v1',
      agent: updated,
    };
  }

  async retireAgent(agentId: string, input: AgentDefinitionLifecycleRequest): Promise<AgentDefinitionResponse> {
    const timestamp = this.now();
    const updated = await this.governanceRepository.runInTransaction(async (repository) => {
      await repository.lockAgent(agentId);
      const agent = await repository.getAgent(agentId);
      if (!agent) {
        throw new PlatformError(404, 'AGENT_NOT_FOUND', 'agent not found');
      }
      const next = await repository.updateAgent({
        ...agent,
        activationState: 'retired',
        updatedBy: input.userId,
        updatedAt: timestamp,
      });
      await this.pauseScheduleTriggersForAgent(repository, agent.agentId, input.userId, timestamp);
      return next;
    });
    return {
      schemaVersion: 'v1',
      agent: updated,
    };
  }

  async listTriggerBindings(agentId: string): Promise<TriggerBindingListResponse> {
    await this.requireAgent(agentId);
    return {
      schemaVersion: 'v1',
      triggerBindings: await this.governanceRepository.listTriggerBindingsByAgent(agentId),
    };
  }

  async createTriggerBinding(agentId: string, input: TriggerBindingCreateRequest): Promise<TriggerBindingResponse> {
    const agent = await this.requireAgent(agentId);
    if (agent.workspaceId !== input.workspaceId) {
      throw new PlatformError(409, 'TRIGGER_WORKSPACE_MISMATCH', 'trigger binding workspace must match the owning agent workspace');
    }
    this.validateTriggerConfig(input.triggerKind, input.configJson);
    const timestamp = this.now();
    const triggerBinding: TriggerBindingRecord = {
      triggerBindingId: this.uuid(),
      workspaceId: agent.workspaceId,
      agentId: agent.agentId,
      triggerKind: input.triggerKind,
      status: 'draft',
      configJson: input.configJson,
      publicTriggerKey: input.triggerKind === 'webhook' ? this.uuid() : undefined,
      lastTriggeredAt: undefined,
      nextTriggerAt: undefined,
      lastError: undefined,
      createdBy: input.userId,
      updatedBy: input.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return {
      schemaVersion: 'v1',
      triggerBinding: await this.governanceRepository.createTriggerBinding(triggerBinding),
    };
  }

  async enableTriggerBinding(
    triggerBindingId: string,
    input: TriggerBindingLifecycleRequest,
  ): Promise<TriggerBindingResponse> {
    const triggerBinding = await this.requireTriggerBinding(triggerBindingId);
    if (triggerBinding.triggerKind === 'event_subscription') {
      throw new PlatformError(409, 'EVENT_SUBSCRIPTION_NOT_AVAILABLE_IN_B5', 'event subscription triggers are not enabled in B5');
    }
    const agent = await this.requireAgent(triggerBinding.agentId);
    const request = await this.createGovernanceChangeRequestRecord({
      workspaceId: triggerBinding.workspaceId,
      requestKind: 'trigger_enable',
      targetType: 'trigger_binding',
      targetRef: triggerBinding.triggerBindingId,
      requestedByActorId: input.userId,
      riskLevel: agent.riskLevel || 'R1',
      summary: sanitizeText(input.summary) || `Enable ${triggerBinding.triggerKind} trigger for ${agent.name}`,
      justification: sanitizeText(input.justification),
      desiredStateJson: {
        status: 'enabled',
      },
    });
    const pending = await this.governanceRepository.updateTriggerBinding({
      ...triggerBinding,
      status: 'pending_approval',
      updatedBy: input.userId,
      updatedAt: this.now(),
    });
    return {
      schemaVersion: 'v1',
      triggerBinding: pending,
      governanceRequest: request,
    };
  }

  async disableTriggerBinding(
    triggerBindingId: string,
    input: TriggerBindingLifecycleRequest,
  ): Promise<TriggerBindingResponse> {
    const triggerBinding = await this.requireTriggerBinding(triggerBindingId);
    const updated = await this.governanceRepository.updateTriggerBinding({
      ...triggerBinding,
      status: 'disabled',
      nextTriggerAt: undefined,
      updatedBy: input.userId,
      updatedAt: this.now(),
    });
    return {
      schemaVersion: 'v1',
      triggerBinding: updated,
    };
  }

  async listPolicyBindings(): Promise<PolicyBindingListResponse> {
    return {
      schemaVersion: 'v1',
      policyBindings: await this.governanceRepository.listPolicyBindings(),
    };
  }

  async createPolicyBinding(input: PolicyBindingCreateRequest): Promise<PolicyBindingResponse> {
    const timestamp = this.now();
    const record: PolicyBindingRecord = {
      policyBindingId: this.uuid(),
      workspaceId: input.workspaceId,
      policyKind: input.policyKind,
      targetType: input.targetType,
      targetRef: input.targetRef,
      status: 'draft',
      configJson: input.configJson,
      createdBy: input.userId,
      updatedBy: input.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return {
      schemaVersion: 'v1',
      policyBinding: await this.governanceRepository.createPolicyBinding(record),
    };
  }

  async listSecretRefs(): Promise<SecretRefListResponse> {
    return {
      schemaVersion: 'v1',
      secretRefs: await this.governanceRepository.listSecretRefs(),
    };
  }

  async createSecretRef(input: SecretRefCreateRequest): Promise<SecretRefResponse> {
    const timestamp = this.now();
    const record: SecretRefRecord = {
      secretRefId: this.uuid(),
      workspaceId: input.workspaceId,
      environmentScope: sanitizeText(input.environmentScope) || '*',
      providerType: sanitizeText(input.providerType) || 'generic',
      status: 'active',
      metadataJson: input.metadataJson || {},
      createdBy: input.userId,
      updatedBy: input.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return {
      schemaVersion: 'v1',
      secretRef: await this.governanceRepository.createSecretRef(record),
    };
  }

  async listScopeGrants(): Promise<ScopeGrantListResponse> {
    return {
      schemaVersion: 'v1',
      scopeGrants: await this.governanceRepository.listScopeGrants(),
    };
  }

  async listGovernanceChangeRequests(): Promise<GovernanceChangeRequestListResponse> {
    return {
      schemaVersion: 'v1',
      requests: await this.governanceRepository.listGovernanceChangeRequests(),
    };
  }

  async getGovernanceChangeRequest(requestId: string): Promise<GovernanceChangeRequestDetailResponse> {
    const request = await this.governanceRepository.getGovernanceChangeRequest(requestId);
    if (!request) {
      throw new PlatformError(404, 'GOVERNANCE_REQUEST_NOT_FOUND', 'governance request not found');
    }
    return {
      schemaVersion: 'v1',
      request,
      decisions: await this.governanceRepository.listGovernanceChangeDecisions(requestId),
    };
  }

  async createGovernanceChangeRequest(
    input: GovernanceChangeRequestCreateRequest,
  ): Promise<GovernanceChangeRequestResponse> {
    const request = await this.createGovernanceChangeRequestRecord({
      workspaceId: input.workspaceId,
      requestKind: input.requestKind,
      targetType: input.targetType,
      targetRef: input.targetRef,
      requestedByActorId: input.requestedByActorId,
      riskLevel: input.riskLevel,
      summary: input.summary,
      justification: input.justification,
      desiredStateJson: input.desiredStateJson || {},
    });
    return {
      schemaVersion: 'v1',
      request,
    };
  }

  async approveGovernanceChangeRequest(
    requestId: string,
    input: GovernanceChangeDecisionRequest,
  ): Promise<GovernanceChangeDecisionResponse> {
    const approvedAt = this.now();
    let decision!: GovernanceChangeDecisionResponse;
    await this.governanceRepository.runInTransaction(async (repository) => {
      const request = await repository.getGovernanceChangeRequest(requestId);
      if (!request) {
        throw new PlatformError(404, 'GOVERNANCE_REQUEST_NOT_FOUND', 'governance request not found');
      }
      if (request.status !== 'pending') {
        throw new PlatformError(409, 'GOVERNANCE_REQUEST_NOT_PENDING', 'governance request is not pending');
      }
      const decisionRecord = await repository.createGovernanceChangeDecision({
        decisionId: this.uuid(),
        requestId,
        actorRef: input.actorRef,
        decision: 'approved',
        comment: sanitizeText(input.comment),
        decidedAt: approvedAt,
      });
      const approvedRequest = await repository.updateGovernanceChangeRequest({
        ...request,
        status: 'approved',
        updatedAt: approvedAt,
      });
      decision = await this.applyGovernanceChange(repository, approvedRequest, decisionRecord, input.actorRef);
    });
    return decision;
  }

  async rejectGovernanceChangeRequest(
    requestId: string,
    input: GovernanceChangeDecisionRequest,
  ): Promise<GovernanceChangeDecisionResponse> {
    const request = await this.governanceRepository.getGovernanceChangeRequest(requestId);
    if (!request) {
      throw new PlatformError(404, 'GOVERNANCE_REQUEST_NOT_FOUND', 'governance request not found');
    }
    if (request.status !== 'pending') {
      throw new PlatformError(409, 'GOVERNANCE_REQUEST_NOT_PENDING', 'governance request is not pending');
    }
    const decisionRecord = await this.governanceRepository.createGovernanceChangeDecision({
      decisionId: this.uuid(),
      requestId,
      actorRef: input.actorRef,
      decision: 'rejected',
      comment: sanitizeText(input.comment),
      decidedAt: this.now(),
    });
    const rejectedRequest = await this.governanceRepository.updateGovernanceChangeRequest({
      ...request,
      status: 'rejected',
      updatedAt: this.now(),
    });
    return {
      schemaVersion: 'v1',
      request: rejectedRequest,
      decision: decisionRecord,
    };
  }

  async listDueScheduleTriggers(timestamp: number): Promise<DueScheduleTriggerListResponse> {
    const due = await this.governanceRepository.listDueScheduleTriggers(timestamp);
    const runnable: DueScheduleTriggerListResponse['triggers'] = [];
    for (const item of due) {
      const triggerBinding = await this.governanceRepository.getTriggerBinding(item.triggerBindingId);
      if (!triggerBinding) continue;
      const agent = await this.governanceRepository.getAgent(item.agentId);
      if (!agent) continue;
      if (await this.isTriggerBindingRunnable(agent, triggerBinding) === false) {
        continue;
      }
      runnable.push(item);
    }
    return {
      schemaVersion: 'v1',
      triggers: runnable,
    };
  }

  async getWebhookTriggerRuntimeConfig(publicTriggerKey: string): Promise<WebhookTriggerRuntimeConfigResponse> {
    const triggerBinding = await this.governanceRepository.getTriggerBindingByPublicKey(publicTriggerKey);
    if (!triggerBinding || triggerBinding.triggerKind !== 'webhook') {
      throw new PlatformError(404, 'WEBHOOK_TRIGGER_NOT_FOUND', 'webhook trigger not found');
    }
    const agent = await this.requireAgent(triggerBinding.agentId);
    if (await this.isTriggerBindingRunnable(agent, triggerBinding) === false) {
      throw new PlatformError(409, 'TRIGGER_NOT_RUNNABLE', 'trigger is not runnable');
    }
    const secretRefId = normalizeString(triggerBinding.configJson.secretRefId);
    if (!secretRefId) {
      throw new PlatformError(409, 'WEBHOOK_SECRET_REF_MISSING', 'webhook trigger requires secretRefId');
    }
    const secretRef = await this.governanceRepository.getSecretRef(secretRefId);
    if (!secretRef) {
      throw new PlatformError(404, 'SECRET_REF_NOT_FOUND', 'secret ref not found');
    }
    const scopeGrant = await this.findGrantForSecret(triggerBinding, secretRefId);
    if (!isSecretUsable(secretRef, scopeGrant, secretRef.environmentScope)) {
      throw new PlatformError(409, 'SECRET_REF_NOT_USABLE', 'secret ref is not usable for this trigger');
    }
    const secretEnvKey = normalizeString(secretRef.metadataJson.envKey);
    if (!secretEnvKey) {
      throw new PlatformError(409, 'WEBHOOK_SECRET_ENV_KEY_MISSING', 'secret ref does not contain a webhook envKey');
    }
    return {
      schemaVersion: 'v1',
      trigger: {
        triggerBindingId: triggerBinding.triggerBindingId,
        agentId: triggerBinding.agentId,
        workspaceId: triggerBinding.workspaceId,
        publicTriggerKey,
        secretRefId,
        secretEnvKey,
        signatureHeader: getWebhookSignatureHeader(triggerBinding.configJson),
        timestampHeader: getWebhookTimestampHeader(triggerBinding.configJson),
        dedupeHeader: getWebhookDedupeHeader(triggerBinding.configJson),
        replayWindowMs: getWebhookReplayWindowMs(triggerBinding.configJson),
      },
    };
  }

  async dispatchScheduleTrigger(
    triggerBindingId: string,
    input: TriggerDispatchRequest,
  ): Promise<TriggerDispatchResponse> {
    return await this.dispatchTrigger('schedule', triggerBindingId, input);
  }

  async dispatchWebhookTrigger(
    publicTriggerKey: string,
    input: TriggerDispatchRequest,
  ): Promise<TriggerDispatchResponse> {
    const triggerBinding = await this.governanceRepository.getTriggerBindingByPublicKey(publicTriggerKey);
    if (!triggerBinding) {
      throw new PlatformError(404, 'WEBHOOK_TRIGGER_NOT_FOUND', 'webhook trigger not found');
    }
    return await this.dispatchTrigger('webhook', triggerBinding.triggerBindingId, input);
  }

  async listDrafts(sessionId?: string): Promise<WorkflowDraftListResponse> {
    if (!sessionId) {
      return {
        schemaVersion: 'v1',
        drafts: await this.repository.listDrafts(),
        sessionLinks: [],
      };
    }
    const sessionDrafts = await this.repository.listDraftsBySession(sessionId);
    return {
      schemaVersion: 'v1',
      drafts: sessionDrafts.drafts,
      sessionLinks: sessionDrafts.sessionLinks,
    };
  }

  async getDraft(draftId: string, sessionId?: string): Promise<WorkflowDraftDetailResponse> {
    const draft = await this.repository.getDraft(draftId);
    if (!draft) {
      throw new PlatformError(404, 'DRAFT_NOT_FOUND', 'draft not found');
    }
    return {
      schemaVersion: 'v1',
      draft,
      revisions: await this.repository.listDraftRevisions(draftId),
      sessionLinks: sessionId ? await this.repository.listSessionLinks(sessionId) : [],
    };
  }

  async createDraft(input: WorkflowDraftCreateRequest): Promise<WorkflowDraftMutateResponse> {
    const timestamp = this.now();
    const draftId = this.uuid();
    const spec = buildInitialSpec(input, draftId);
    const draft: WorkflowDraftRecord = {
      draftId,
      workflowKey: sanitizeText(spec.workflowKey),
      name: sanitizeText(spec.name),
      status: input.initialText ? 'collecting_input' : 'created',
      basedOnTemplateVersionId: input.basedOnTemplateVersionId,
      publishedTemplateVersionId: undefined,
      currentSpec: spec,
      latestValidationSummary: undefined,
      publishable: false,
      activeRevisionNumber: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const source = input.source || (input.initialText ? 'builder_text_entry' : 'builder_quick_entry');
    const revision = createDraftRevision({
      uuid: this.uuid,
      timestamp,
      draftId,
      revisionNumber: 1,
      source,
      actorId: input.userId,
      changeSummary: input.initialText ? 'Created draft from builder intake' : 'Created draft from builder quick entry',
      specSnapshot: spec,
    });
    return await this.repository.runInTransaction(async (repository) => (
      await this.persistDraftMutation(repository, {
        draft,
        revision,
        sessionId: input.sessionId,
        userId: input.userId,
        createDraft: true,
      })
    ));
  }

  async focusDraft(draftId: string, input: WorkflowDraftFocusRequest): Promise<WorkflowDraftFocusResponse> {
    return await this.repository.runInTransaction(async (repository) => {
      await repository.lockSession(input.sessionId);
      const draft = await repository.getDraft(draftId);
      if (!draft) {
        throw new PlatformError(404, 'DRAFT_NOT_FOUND', 'draft not found');
      }
      const link = await repository.getSessionLink(input.sessionId, draftId);
      if (!link) {
        await repository.upsertSessionLink({
          sessionId: input.sessionId,
          draftId,
          userId: input.userId,
          isActive: false,
          createdAt: draft.createdAt,
          updatedAt: this.now(),
          lastFocusedAt: undefined,
        });
      }
      const sessionLinks = await repository.setActiveDraft(input.sessionId, draftId, input.userId, this.now());
      const sessionDrafts = await repository.listDraftsBySession(input.sessionId);
      return {
        schemaVersion: 'v1',
        draft,
        sessionDrafts: sessionDrafts.drafts,
        sessionLinks,
      };
    });
  }

  async intakeDraft(draftId: string, input: WorkflowDraftIntakeRequest): Promise<WorkflowDraftMutateResponse> {
    return await this.repository.runInTransaction(async (repository) => {
      const draft = await this.requireEditableSessionDraftFrom(repository, draftId, input.sessionId);
      const requirements = normalizeRequirements(draft.currentSpec);
      requirements.push(input.text.trim());
      const nextSpec: WorkflowDraftSpec = {
        ...cloneSpec(draft.currentSpec),
        requirements,
      };
      const timestamp = this.now();
      const nextDraft: WorkflowDraftRecord = {
        ...draft,
        workflowKey: sanitizeText(nextSpec.workflowKey),
        name: sanitizeText(nextSpec.name),
        status: 'collecting_input',
        currentSpec: nextSpec,
        latestValidationSummary: undefined,
        publishable: false,
        activeRevisionNumber: draft.activeRevisionNumber + 1,
        updatedAt: timestamp,
      };
      const revision = createDraftRevision({
        uuid: this.uuid,
        timestamp,
        draftId,
        revisionNumber: nextDraft.activeRevisionNumber,
        source: input.source || 'chat_intake',
        actorId: input.userId,
        changeSummary: 'Appended builder requirement from chat intake',
        specSnapshot: nextSpec,
      });

      return await this.persistDraftMutation(repository, {
        draft: nextDraft,
        revision,
        sessionId: input.sessionId,
        userId: input.userId,
      });
    });
  }

  async synthesizeDraft(draftId: string, input: WorkflowDraftFocusRequest): Promise<WorkflowDraftMutateResponse> {
    return await this.repository.runInTransaction(async (repository) => {
      const draft = await this.requireEditableSessionDraftFrom(repository, draftId, input.sessionId);
      const timestamp = this.now();
      const nextSpec = buildSynthesizedSpec(draft);
      const nextDraft: WorkflowDraftRecord = {
        ...draft,
        workflowKey: sanitizeText(nextSpec.workflowKey),
        name: sanitizeText(nextSpec.name),
        status: 'synthesized',
        currentSpec: nextSpec,
        latestValidationSummary: undefined,
        publishable: false,
        activeRevisionNumber: draft.activeRevisionNumber + 1,
        updatedAt: timestamp,
      };
      const revision = createDraftRevision({
        uuid: this.uuid,
        timestamp,
        draftId,
        revisionNumber: nextDraft.activeRevisionNumber,
        source: 'builder_synthesize',
        actorId: input.userId,
        changeSummary: 'Synthesized draft into workflow template candidate',
        specSnapshot: nextSpec,
      });

      return await this.persistDraftMutation(repository, {
        draft: nextDraft,
        revision,
        sessionId: input.sessionId,
        userId: input.userId,
      });
    });
  }

  async validateDraft(draftId: string, input: WorkflowDraftFocusRequest): Promise<WorkflowDraftMutateResponse> {
    return await this.repository.runInTransaction(async (repository) => {
      const draft = await this.requireEditableSessionDraftFrom(repository, draftId, input.sessionId);
      const timestamp = this.now();
      const validationSummary = validateDraftSpec(draft.currentSpec, timestamp);
      const nextDraft: WorkflowDraftRecord = {
        ...draft,
        workflowKey: sanitizeText(draft.currentSpec.workflowKey),
        name: sanitizeText(draft.currentSpec.name),
        status: resolveDraftStatus(draft.status, validationSummary.isPublishable),
        latestValidationSummary: validationSummary,
        publishable: validationSummary.isPublishable,
        activeRevisionNumber: draft.activeRevisionNumber + 1,
        updatedAt: timestamp,
      };
      const revision = createDraftRevision({
        uuid: this.uuid,
        timestamp,
        draftId,
        revisionNumber: nextDraft.activeRevisionNumber,
        source: 'builder_validate',
        actorId: input.userId,
        changeSummary: validationSummary.isPublishable
          ? 'Validated draft and marked it publishable'
          : 'Validated draft and captured blocking issues',
        specSnapshot: cloneSpec(draft.currentSpec),
        validationSummary,
      });

      return await this.persistDraftMutation(repository, {
        draft: nextDraft,
        revision,
        sessionId: input.sessionId,
        userId: input.userId,
      });
    });
  }

  async patchDraftSpec(draftId: string, input: WorkflowDraftSpecPatchRequest): Promise<WorkflowDraftSpecPatchResponse> {
    return await this.repository.runInTransaction(async (repository) => {
      const draft = await this.requireEditableSessionDraftFrom(repository, draftId, input.sessionId);
      const revisions = await repository.listDraftRevisions(draftId);
      const latestRevision = revisions.at(-1);
      if (!latestRevision) {
        throw new PlatformError(409, 'DRAFT_REVISION_MISSING', 'draft revision history missing');
      }
      if (latestRevision.revisionId !== input.baseRevisionId) {
        throw new PlatformError(409, 'DRAFT_REVISION_CONFLICT', 'draft revision is stale');
      }

      const timestamp = this.now();
      const nextSpec = applyDraftSpecPatch(draft.currentSpec, input.patch);
      const nextDraft: WorkflowDraftRecord = {
        ...draft,
        workflowKey: sanitizeText(nextSpec.workflowKey),
        name: sanitizeText(nextSpec.name),
        status: 'editable',
        currentSpec: nextSpec,
        latestValidationSummary: undefined,
        publishable: false,
        activeRevisionNumber: draft.activeRevisionNumber + 1,
        updatedAt: timestamp,
      };
      const revision = createDraftRevision({
        uuid: this.uuid,
        timestamp,
        draftId,
        revisionNumber: nextDraft.activeRevisionNumber,
        source: 'console_edit',
        actorId: input.userId,
        changeSummary: input.changeSummary,
        specSnapshot: cloneSpec(nextSpec),
      });
      const mutation = await this.persistDraftMutation(repository, {
        draft: nextDraft,
        revision,
        sessionId: input.sessionId,
        userId: input.userId,
      });
      return {
        schemaVersion: 'v1',
        draft: mutation.draft,
        revision: mutation.revision,
        sessionDrafts: mutation.sessionDrafts,
        sessionLinks: mutation.sessionLinks,
      };
    });
  }

  async publishDraft(draftId: string, input: WorkflowDraftPublishRequest): Promise<WorkflowDraftPublishResponse> {
    return await this.repository.runInTransaction(async (repository) => {
      const draft = await this.requireEditableSessionDraftFrom(repository, draftId, input.sessionId);
      if (!draft.publishable || !draft.latestValidationSummary?.isPublishable) {
        throw new PlatformError(409, 'DRAFT_NOT_PUBLISHABLE', 'draft must pass validation before publish');
      }

      const timestamp = this.now();
      const spec = toTemplateSpec(draft.currentSpec);
      await repository.lockWorkflowKey(spec.workflowKey);

      let workflow = await repository.getWorkflowByKey(spec.workflowKey);
      let versionNumber = 1;

      if (!workflow) {
        workflow = await repository.createWorkflowTemplate({
          workflowId: this.uuid(),
          workflowKey: spec.workflowKey,
          name: spec.name,
          compatProviderId: spec.compatProviderId,
          status: 'active',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      } else {
        const updated: WorkflowTemplateRecord = {
          ...workflow,
          workflowKey: spec.workflowKey,
          name: spec.name,
          compatProviderId: spec.compatProviderId,
          updatedAt: timestamp,
        };
        workflow = await repository.updateWorkflowTemplate(updated);
        const detail = await repository.getWorkflow(workflow.workflowId);
        versionNumber = detail && detail.versions.length > 0 ? detail.versions.at(-1)!.version + 1 : 1;
        await repository.supersedePublishedVersions(workflow.workflowId);
      }

      const version: WorkflowTemplateVersionRecord = {
        templateVersionId: this.uuid(),
        workflowId: workflow.workflowId,
        workflowKey: workflow.workflowKey,
        version: versionNumber,
        status: 'published',
        spec,
        createdAt: timestamp,
      };

      const createdVersion = await repository.createWorkflowVersion(version);
      const publishRevision = createDraftRevision({
        uuid: this.uuid,
        timestamp,
        draftId,
        revisionNumber: draft.activeRevisionNumber + 1,
        source: 'builder_publish',
        actorId: input.userId,
        changeSummary: `Published draft as workflow version v${versionNumber}`,
        specSnapshot: cloneSpec(draft.currentSpec),
        validationSummary: draft.latestValidationSummary,
      });
      const nextDraft: WorkflowDraftRecord = {
        ...draft,
        status: 'published',
        publishedTemplateVersionId: createdVersion.templateVersionId,
        publishable: false,
        activeRevisionNumber: publishRevision.revisionNumber,
        updatedAt: timestamp,
      };

      const mutation = await this.persistDraftMutation(repository, {
        draft: nextDraft,
        revision: publishRevision,
        sessionId: input.sessionId,
        userId: input.userId,
      });

      return {
        schemaVersion: 'v1',
        draft: mutation.draft,
        workflow,
        version: createdVersion,
        sessionDrafts: mutation.sessionDrafts,
        sessionLinks: mutation.sessionLinks,
      };
    });
  }

  async listRecipeDrafts(): Promise<RecipeDraftRecord[]> {
    return await this.repository.listRecipeDrafts();
  }

  async getRecipeDraft(recipeDraftId: string): Promise<RecipeDraftRecord> {
    const recipeDraft = await this.repository.getRecipeDraft(recipeDraftId);
    if (!recipeDraft) {
      throw new PlatformError(404, 'RECIPE_DRAFT_NOT_FOUND', 'recipe draft not found');
    }
    return recipeDraft;
  }

  async createRecipeDraft(input: RecipeDraftCreateRequest): Promise<RecipeDraftRecord> {
    const timestamp = this.now();
    const record: RecipeDraftRecord = {
      recipeDraftId: this.uuid(),
      title: sanitizeText(input.title),
      status: input.status || 'captured',
      sourceRefs: input.sourceRefs || [],
      normalizedSteps: input.normalizedSteps || [],
      assumptions: input.assumptions || [],
      reviewerNotes: input.reviewerNotes || [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return await this.repository.createRecipeDraft(record);
  }

  async updateRecipeDraft(recipeDraftId: string, input: RecipeDraftUpdateRequest): Promise<RecipeDraftRecord> {
    const existing = await this.getRecipeDraft(recipeDraftId);
    const record: RecipeDraftRecord = {
      ...existing,
      title: input.title !== undefined ? sanitizeText(input.title) : existing.title,
      status: (input.status || existing.status) as RecipeDraftStatus,
      sourceRefs: input.sourceRefs || existing.sourceRefs,
      normalizedSteps: input.normalizedSteps || existing.normalizedSteps,
      assumptions: input.assumptions || existing.assumptions,
      reviewerNotes: input.reviewerNotes || existing.reviewerNotes,
      updatedAt: this.now(),
    };
    return await this.repository.updateRecipeDraft(record);
  }

  private async attachCapturedRecipeDrafts(response: WorkflowCommandResponse): Promise<WorkflowCommandResponse> {
    return {
      ...response,
      capturedRecipeDrafts: await this.captureRunDerivedRecipeDrafts(response.run),
    };
  }

  private async captureRunDerivedRecipeDrafts(run: WorkflowRunSnapshot): Promise<RecipeDraftRecord[]> {
    const derivedCandidates = this.extractRunDerivedRecipeCandidates(run);
    if (derivedCandidates.length === 0) {
      return [];
    }

    const captured: RecipeDraftRecord[] = [];

    for (const candidate of derivedCandidates) {
      const next = this.buildRunDerivedRecipeDraft(run, candidate.candidateArtifact, candidate.evidenceArtifacts);
      captured.push(await this.repository.upsertRunDerivedRecipeDraft(next));
    }

    return captured;
  }

  private extractRunDerivedRecipeCandidates(run: WorkflowRunSnapshot): Array<{
    candidateArtifact: WorkflowArtifactRecord;
    evidenceArtifacts: WorkflowArtifactRecord[];
  }> {
    if (this.hasApprovedRecipeCapture(run) === false) {
      return [];
    }

    const evidenceArtifacts = run.artifacts.filter((artifact) => artifact.artifactType === 'EvidencePack');
    if (evidenceArtifacts.length === 0) {
      return [];
    }

    return run.artifacts
      .filter((artifact) => artifact.artifactType === 'AnalysisRecipeCandidate')
      .map((candidateArtifact) => {
        const payload = isRecord(candidateArtifact.payloadJson) ? candidateArtifact.payloadJson : {};
        const evidenceRefs = Array.isArray(payload.evidenceRefs)
          ? payload.evidenceRefs.map((item) => String(item))
          : [];
        const matchedEvidence = evidenceRefs.length > 0
          ? evidenceArtifacts.filter((artifact) => evidenceRefs.includes(artifact.artifactId))
          : evidenceArtifacts;
        if (matchedEvidence.length === 0) {
          return undefined;
        }
        return {
          candidateArtifact,
          evidenceArtifacts: matchedEvidence,
        };
      })
      .filter((item): item is {
        candidateArtifact: WorkflowArtifactRecord;
        evidenceArtifacts: WorkflowArtifactRecord[];
      } => Boolean(item));
  }

  private hasApprovedRecipeCapture(run: WorkflowRunSnapshot): boolean {
    return run.approvalDecisions.some((decision) => decision.decision === 'approved')
      || run.artifacts.some((artifact) => artifact.artifactType === 'AssessmentDraft' && artifact.state === 'published')
      || run.artifacts.some((artifact) => artifact.artifactType === 'ReviewableDelivery' && artifact.state === 'published');
  }

  private buildRunDerivedRecipeDraft(
    run: WorkflowRunSnapshot,
    candidateArtifact: WorkflowArtifactRecord,
    evidenceArtifacts: WorkflowArtifactRecord[],
  ): RecipeDraftRecord {
    const timestamp = this.now();
    const payload = isRecord(candidateArtifact.payloadJson) ? candidateArtifact.payloadJson : {};
    const reviewerNotes = [
      ...this.normalizeStringArray(payload.reviewerNotes),
      'Captured from workflow runtime.',
    ];

    return {
      recipeDraftId: this.uuid(),
      title: sanitizeText(typeof payload.title === 'string' ? payload.title : undefined),
      status: 'captured',
      sourceArtifactId: candidateArtifact.artifactId,
      sourceRefs: [
        {
          type: 'workflow_run',
          source: 'run_derived_recipe',
          runId: run.run.runId,
          workflowKey: run.run.workflowKey,
          templateVersionId: run.run.templateVersionId,
        },
        {
          type: 'source_artifact',
          artifactType: candidateArtifact.artifactType,
          artifactId: candidateArtifact.artifactId,
        },
        ...evidenceArtifacts.map((artifact) => ({
          type: 'evidence_artifact',
          artifactType: artifact.artifactType,
          artifactId: artifact.artifactId,
        })),
      ],
      normalizedSteps: this.normalizeRecipeSteps(payload.normalizedSteps),
      assumptions: this.normalizeStringArray(payload.assumptions),
      reviewerNotes: [...new Set(reviewerNotes)],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  private async requirePublishedVersion(templateVersionId: string): Promise<WorkflowTemplateVersionRecord> {
    const version = await this.repository.getVersion(templateVersionId);
    if (!version) {
      throw new PlatformError(404, 'WORKFLOW_VERSION_NOT_FOUND', 'workflow version not found');
    }
    if (version.status !== 'published') {
      throw new PlatformError(409, 'WORKFLOW_VERSION_NOT_PUBLISHED', 'workflow version must be published');
    }
    return version;
  }

  private async requireAgent(agentId: string): Promise<AgentDefinitionRecord> {
    const agent = await this.governanceRepository.getAgent(agentId);
    if (!agent) {
      throw new PlatformError(404, 'AGENT_NOT_FOUND', 'agent not found');
    }
    return agent;
  }

  private async requireBridgeRegistration(bridgeId: string): Promise<BridgeRegistrationRecord> {
    const bridge = await this.governanceRepository.getBridgeRegistration(bridgeId);
    if (!bridge) {
      throw new PlatformError(404, 'BRIDGE_NOT_FOUND', 'bridge not found');
    }
    return bridge;
  }

  private async requireTriggerBinding(triggerBindingId: string): Promise<TriggerBindingRecord> {
    const triggerBinding = await this.governanceRepository.getTriggerBinding(triggerBindingId);
    if (!triggerBinding) {
      throw new PlatformError(404, 'TRIGGER_BINDING_NOT_FOUND', 'trigger binding not found');
    }
    return triggerBinding;
  }

  private validateTriggerConfig(triggerKind: TriggerBindingRecord['triggerKind'], configJson: Record<string, unknown>): void {
    if (triggerKind === 'schedule') {
      computeNextScheduleTriggerAt(configJson, this.now());
      return;
    }
    if (triggerKind === 'webhook') {
      if (!normalizeString(configJson.secretRefId)) {
        throw new PlatformError(400, 'INVALID_WEBHOOK_CONFIG', 'webhook trigger requires secretRefId');
      }
      return;
    }
    if (triggerKind === 'event_subscription') {
      return;
    }
    throw new PlatformError(400, 'INVALID_TRIGGER_KIND', 'unsupported trigger kind');
  }

  private async validateAgentBridgeConfiguration(
    workspaceId: string,
    executorStrategy: AgentDefinitionRecord['executorStrategy'],
    bridgeId?: string,
  ): Promise<void> {
    if (executorStrategy === 'external_runtime') {
      if (!bridgeId) {
        throw new PlatformError(400, 'BRIDGE_ID_REQUIRED', 'external_runtime agents require bridgeId');
      }
      const bridge = await this.requireBridgeRegistration(bridgeId);
      this.assertWorkspaceMatch(
        bridge.workspaceId,
        workspaceId,
        'BRIDGE_WORKSPACE_MISMATCH',
        'bridge workspace must match the owning agent workspace',
      );
      return;
    }
    if (bridgeId) {
      throw new PlatformError(409, 'BRIDGE_ID_NOT_ALLOWED', 'platform_runtime agents cannot bind a bridgeId');
    }
  }

  private buildExternalRuntimeSnapshot(bridge: BridgeRegistrationRecord): WorkflowRuntimeStartRunRequest['externalRuntime'] {
    return {
      bridgeId: bridge.bridgeId,
      workspaceId: bridge.workspaceId,
      name: bridge.name,
      baseUrl: bridge.baseUrl,
      serviceId: bridge.serviceId,
      runtimeType: bridge.runtimeType,
      manifest: bridge.manifestJson,
      authConfigJson: bridge.authConfigJson,
      callbackConfigJson: bridge.callbackConfigJson,
      callbackUrl: `${this.runtimePublicBaseUrl}/internal/runtime/bridge-callback`,
    };
  }

  private async startManagedAgentRun(params: {
    agent: AgentDefinitionRecord;
    workflowDetail: WorkflowDetail;
    workflowVersion: WorkflowTemplateVersionRecord;
    traceId: string;
    sessionId: string;
    userId: string;
    inputText?: string;
    inputPayload?: Record<string, unknown>;
    sourceType: NonNullable<WorkflowRuntimeStartRunRequest['sourceType']>;
    sourceRef?: string;
    runtimeMetadata?: Record<string, unknown>;
  }): Promise<WorkflowCommandResponse> {
    let externalRuntime: WorkflowRuntimeStartRunRequest['externalRuntime'];
    if (params.agent.executorStrategy === 'external_runtime') {
      if (!params.agent.bridgeId) {
        throw new PlatformError(409, 'AGENT_BRIDGE_NOT_BOUND', 'external_runtime agent must bind a bridge');
      }
      const bridge = await this.requireBridgeRegistration(params.agent.bridgeId);
      this.assertWorkspaceMatch(
        bridge.workspaceId,
        params.agent.workspaceId,
        'BRIDGE_WORKSPACE_MISMATCH',
        'bridge workspace must match the owning agent workspace',
      );
      if (bridge.status !== 'active') {
        throw new PlatformError(409, 'BRIDGE_NOT_ACTIVE', 'bridge must be active before starting an external-runtime run');
      }
      externalRuntime = this.buildExternalRuntimeSnapshot(bridge);
    }

    const response = await this.runtimeClient.startRun({
      schemaVersion: 'v1',
      traceId: params.traceId,
      sessionId: params.sessionId,
      userId: params.userId,
      template: params.workflowDetail.workflow,
      version: params.workflowVersion,
      inputText: params.inputText,
      inputPayload: params.inputPayload,
      agentId: params.agent.agentId,
      sourceType: params.sourceType,
      sourceRef: params.sourceRef,
      runtimeMetadata: {
        ...(params.runtimeMetadata || {}),
        workspaceId: params.agent.workspaceId,
        executorStrategy: params.agent.executorStrategy,
        ...(externalRuntime ? { bridgeId: externalRuntime.bridgeId } : {}),
      },
      externalRuntime,
    });
    return await this.attachCapturedRecipeDrafts(response);
  }

  private assertWorkspaceMatch(expectedWorkspaceId: string, actualWorkspaceId: string, code: string, message: string): void {
    if (expectedWorkspaceId !== actualWorkspaceId) {
      throw new PlatformError(409, code, message);
    }
  }

  private assertGovernanceTargetType(
    requestKind: GovernanceChangeRequestRecord['requestKind'],
    actualTargetType: GovernanceChangeRequestRecord['targetType'],
    allowedTargetTypes: GovernanceChangeRequestRecord['targetType'][],
  ): void {
    if (!allowedTargetTypes.includes(actualTargetType)) {
      throw new PlatformError(
        400,
        'GOVERNANCE_TARGET_TYPE_INVALID',
        `${requestKind} must target ${allowedTargetTypes.join(' or ')}`,
      );
    }
  }

  private async pauseScheduleTriggersForAgent(
    repository: GovernanceRepository,
    agentId: string,
    updatedBy: string,
    timestamp: number,
  ): Promise<void> {
    const triggerBindings = await repository.listTriggerBindingsByAgent(agentId);
    for (const triggerBinding of triggerBindings) {
      if (triggerBinding.triggerKind !== 'schedule' || triggerBinding.status !== 'enabled') {
        continue;
      }
      await repository.lockTriggerBinding(triggerBinding.triggerBindingId);
      const current = await repository.getTriggerBinding(triggerBinding.triggerBindingId);
      if (!current || current.triggerKind !== 'schedule' || current.status !== 'enabled') {
        continue;
      }
      await repository.updateTriggerBinding({
        ...current,
        nextTriggerAt: undefined,
        updatedBy,
        updatedAt: timestamp,
      });
    }
  }

  private async resumeScheduleTriggersForAgent(
    repository: GovernanceRepository,
    agentId: string,
    updatedBy: string,
    timestamp: number,
  ): Promise<void> {
    const triggerBindings = await repository.listTriggerBindingsByAgent(agentId);
    for (const triggerBinding of triggerBindings) {
      if (triggerBinding.triggerKind !== 'schedule' || triggerBinding.status !== 'enabled') {
        continue;
      }
      await repository.lockTriggerBinding(triggerBinding.triggerBindingId);
      const current = await repository.getTriggerBinding(triggerBinding.triggerBindingId);
      if (!current || current.triggerKind !== 'schedule' || current.status !== 'enabled') {
        continue;
      }
      await repository.updateTriggerBinding({
        ...current,
        nextTriggerAt: computeNextScheduleTriggerAt(current.configJson, timestamp),
        lastError: undefined,
        updatedBy,
        updatedAt: timestamp,
      });
    }
  }

  private async validateGovernanceChangeRequestParams(params: {
    workspaceId: string;
    requestKind: GovernanceChangeRequestRecord['requestKind'];
    targetType: GovernanceChangeRequestRecord['targetType'];
    targetRef: string;
    desiredStateJson: Record<string, unknown>;
  }): Promise<void> {
    switch (params.requestKind) {
      case 'agent_activate': {
        this.assertGovernanceTargetType(params.requestKind, params.targetType, ['agent_definition']);
        const agent = await this.requireAgent(params.targetRef);
        this.assertWorkspaceMatch(
          agent.workspaceId,
          params.workspaceId,
          'GOVERNANCE_WORKSPACE_MISMATCH',
          'governance request workspace must match the target agent workspace',
        );
        if (agent.activationState === 'retired' || agent.activationState === 'archived') {
          throw new PlatformError(409, 'GOVERNANCE_CHANGE_NOT_APPLICABLE', 'governance change cannot be applied');
        }
        if (agent.executorStrategy === 'external_runtime') {
          if (!agent.bridgeId) {
            throw new PlatformError(409, 'AGENT_BRIDGE_NOT_BOUND', 'external_runtime agent must bind a bridge before activation');
          }
          const bridge = await this.requireBridgeRegistration(agent.bridgeId);
          this.assertWorkspaceMatch(
            bridge.workspaceId,
            params.workspaceId,
            'BRIDGE_WORKSPACE_MISMATCH',
            'bridge workspace must match the target agent workspace',
          );
          if (bridge.status !== 'active') {
            throw new PlatformError(409, 'BRIDGE_NOT_ACTIVE', 'bridge must be active before activating an external-runtime agent');
          }
        }
        return;
      }
      case 'trigger_enable': {
        this.assertGovernanceTargetType(params.requestKind, params.targetType, ['trigger_binding']);
        const triggerBinding = await this.requireTriggerBinding(params.targetRef);
        this.assertWorkspaceMatch(
          triggerBinding.workspaceId,
          params.workspaceId,
          'GOVERNANCE_WORKSPACE_MISMATCH',
          'governance request workspace must match the target trigger binding workspace',
        );
        if (triggerBinding.triggerKind === 'event_subscription') {
          throw new PlatformError(409, 'EVENT_SUBSCRIPTION_NOT_AVAILABLE_IN_B5', 'event subscription triggers are not enabled in B5');
        }
        return;
      }
      case 'policy_bind_apply':
      case 'external_write_allow': {
        this.assertGovernanceTargetType(params.requestKind, params.targetType, ['policy_binding']);
        const policyBinding = await this.governanceRepository.getPolicyBinding(params.targetRef);
        if (!policyBinding) {
          throw new PlatformError(404, 'POLICY_BINDING_NOT_FOUND', 'policy binding not found');
        }
        this.assertWorkspaceMatch(
          policyBinding.workspaceId,
          params.workspaceId,
          'GOVERNANCE_WORKSPACE_MISMATCH',
          'governance request workspace must match the target policy binding workspace',
        );
        return;
      }
      case 'secret_grant_issue':
      case 'scope_grant_issue': {
        this.assertGovernanceTargetType(params.requestKind, params.targetType, ['agent_definition', 'trigger_binding']);
        const target = params.targetType === 'agent_definition'
          ? await this.requireAgent(params.targetRef)
          : await this.requireTriggerBinding(params.targetRef);
        this.assertWorkspaceMatch(
          target.workspaceId,
          params.workspaceId,
          'GOVERNANCE_WORKSPACE_MISMATCH',
          'governance request workspace must match the target workspace',
        );
        const resourceRef = normalizeString(params.desiredStateJson.resourceRef)
          || normalizeString(params.desiredStateJson.secretRefId);
        if (!resourceRef) {
          throw new PlatformError(400, 'SCOPE_GRANT_RESOURCE_REQUIRED', 'scope grant requires resourceRef');
        }
        const resourceType = normalizeString(params.desiredStateJson.resourceType)
          || (params.requestKind === 'secret_grant_issue' ? 'secret_ref' : undefined);
        if (params.requestKind === 'secret_grant_issue' && resourceType !== 'secret_ref') {
          throw new PlatformError(400, 'SCOPE_GRANT_RESOURCE_TYPE_INVALID', 'secret grant issue must reference a secret_ref resource');
        }
        if (resourceType === 'secret_ref') {
          const secretRef = await this.governanceRepository.getSecretRef(resourceRef);
          if (!secretRef) {
            throw new PlatformError(404, 'SECRET_REF_NOT_FOUND', 'secret ref not found');
          }
          this.assertWorkspaceMatch(
            secretRef.workspaceId,
            params.workspaceId,
            'GOVERNANCE_RESOURCE_WORKSPACE_MISMATCH',
            'governance request workspace must match the referenced secret workspace',
          );
        }
        return;
      }
      case 'scope_widen': {
        this.assertGovernanceTargetType(params.requestKind, params.targetType, ['scope_grant']);
        const scopeGrant = await this.governanceRepository.getScopeGrant(params.targetRef);
        if (!scopeGrant) {
          throw new PlatformError(404, 'SCOPE_GRANT_NOT_FOUND', 'scope grant not found');
        }
        this.assertWorkspaceMatch(
          scopeGrant.workspaceId,
          params.workspaceId,
          'GOVERNANCE_WORKSPACE_MISMATCH',
          'governance request workspace must match the target scope grant workspace',
        );
        return;
      }
      default:
        return;
    }
  }

  private async createGovernanceChangeRequestRecord(params: {
    workspaceId: string;
    requestKind: GovernanceChangeRequestRecord['requestKind'];
    targetType: GovernanceChangeRequestRecord['targetType'];
    targetRef: string;
    requestedByActorId: string;
    riskLevel: GovernanceChangeRequestRecord['riskLevel'];
    summary: string;
    justification?: string;
    desiredStateJson: Record<string, unknown>;
  }): Promise<GovernanceChangeRequestRecord> {
    if (!requiresGovernanceApproval(params.requestKind, params.riskLevel, params.targetType)) {
      throw new PlatformError(409, 'GOVERNANCE_APPROVAL_NOT_REQUIRED', 'governance approval is not required for this action');
    }
    await this.validateGovernanceChangeRequestParams(params);
    const timestamp = this.now();
    return await this.governanceRepository.createGovernanceChangeRequest({
      requestId: this.uuid(),
      workspaceId: params.workspaceId,
      requestKind: params.requestKind,
      targetType: params.targetType,
      targetRef: params.targetRef,
      requestedByActorId: params.requestedByActorId,
      status: 'pending',
      riskLevel: params.riskLevel,
      summary: params.summary,
      justification: params.justification,
      desiredStateJson: params.desiredStateJson,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  private async applyGovernanceChange(
    repository: GovernanceRepository,
    request: GovernanceChangeRequestRecord,
    decision: GovernanceChangeDecisionRecord,
    actorRef: string,
  ): Promise<GovernanceChangeDecisionResponse> {
    let agent: AgentDefinitionRecord | undefined;
    let triggerBinding: TriggerBindingRecord | undefined;
    let policyBinding: PolicyBindingRecord | undefined;
    let scopeGrant: ScopeGrantRecord | undefined;
    const timestamp = this.now();

    switch (request.requestKind) {
      case 'agent_activate': {
        await repository.lockAgent(request.targetRef);
        const current = await repository.getAgent(request.targetRef);
        if (!current) {
          throw new PlatformError(404, 'AGENT_NOT_FOUND', 'agent not found');
        }
        if (!canApplyApprovedChange(request, current)) {
          throw new PlatformError(409, 'GOVERNANCE_CHANGE_NOT_APPLICABLE', 'governance change cannot be applied');
        }
        agent = await repository.updateAgent({
          ...current,
          activationState: 'active',
          updatedBy: actorRef,
          updatedAt: timestamp,
        });
        await this.resumeScheduleTriggersForAgent(repository, current.agentId, actorRef, timestamp);
        break;
      }
      case 'trigger_enable': {
        await repository.lockTriggerBinding(request.targetRef);
        const current = await repository.getTriggerBinding(request.targetRef);
        if (!current) {
          throw new PlatformError(404, 'TRIGGER_BINDING_NOT_FOUND', 'trigger binding not found');
        }
        const currentAgent = await repository.getAgent(current.agentId);
        if (!currentAgent) {
          throw new PlatformError(404, 'AGENT_NOT_FOUND', 'agent not found');
        }
        if (current.triggerKind === 'event_subscription') {
          throw new PlatformError(409, 'EVENT_SUBSCRIPTION_NOT_AVAILABLE_IN_B5', 'event subscription triggers are not enabled in B5');
        }
        if (currentAgent.activationState !== 'active') {
          throw new PlatformError(409, 'AGENT_NOT_ACTIVE', 'agent must be active before enabling triggers');
        }
        triggerBinding = await repository.updateTriggerBinding({
          ...current,
          status: 'enabled',
          publicTriggerKey: current.triggerKind === 'webhook'
            ? current.publicTriggerKey || this.uuid()
            : current.publicTriggerKey,
          nextTriggerAt: current.triggerKind === 'schedule'
            ? computeNextScheduleTriggerAt(current.configJson, timestamp)
            : undefined,
          lastError: undefined,
          updatedBy: actorRef,
          updatedAt: timestamp,
        });
        break;
      }
      case 'policy_bind_apply':
      case 'external_write_allow': {
        const policyBindingId = request.targetType === 'policy_binding'
          ? request.targetRef
          : normalizeString(request.desiredStateJson.policyBindingId);
        if (!policyBindingId) {
          throw new PlatformError(400, 'POLICY_BINDING_TARGET_REQUIRED', 'policy binding target is required');
        }
        const current = await repository.getPolicyBinding(policyBindingId);
        if (!current) {
          throw new PlatformError(404, 'POLICY_BINDING_NOT_FOUND', 'policy binding not found');
        }
        policyBinding = await repository.updatePolicyBinding({
          ...current,
          status: 'active',
          updatedBy: actorRef,
          updatedAt: timestamp,
        });
        break;
      }
      case 'secret_grant_issue':
      case 'scope_grant_issue': {
        const resourceRef = normalizeString(request.desiredStateJson.resourceRef)
          || normalizeString(request.desiredStateJson.secretRefId);
        if (!resourceRef) {
          throw new PlatformError(400, 'SCOPE_GRANT_RESOURCE_REQUIRED', 'scope grant requires resourceRef');
        }
        scopeGrant = await repository.createScopeGrant({
          scopeGrantId: this.uuid(),
          workspaceId: request.workspaceId,
          targetType: request.targetType,
          targetRef: request.targetRef,
          resourceType: normalizeString(request.desiredStateJson.resourceType)
            || (request.requestKind === 'secret_grant_issue' ? 'secret_ref' : 'generic'),
          resourceRef,
          status: 'active',
          scopeJson: normalizeRecord(request.desiredStateJson.scopeJson) || {},
          expiresAt: typeof request.desiredStateJson.expiresAt === 'number'
            ? request.desiredStateJson.expiresAt
            : undefined,
          createdBy: request.requestedByActorId,
          updatedBy: actorRef,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        break;
      }
      case 'scope_widen': {
        const scopeGrantId = normalizeString(request.desiredStateJson.scopeGrantId);
        if (!scopeGrantId) {
          throw new PlatformError(400, 'SCOPE_GRANT_ID_REQUIRED', 'scope widen requires scopeGrantId');
        }
        const current = await repository.getScopeGrant(scopeGrantId);
        if (!current) {
          throw new PlatformError(404, 'SCOPE_GRANT_NOT_FOUND', 'scope grant not found');
        }
        scopeGrant = await repository.updateScopeGrant({
          ...current,
          scopeJson: normalizeRecord(request.desiredStateJson.scopeJson) || current.scopeJson,
          updatedBy: actorRef,
          updatedAt: timestamp,
        });
        break;
      }
      case 'scope_grant_revoke': {
        const scopeGrantId = request.targetType === 'scope_grant'
          ? request.targetRef
          : normalizeString(request.desiredStateJson.scopeGrantId);
        if (!scopeGrantId) {
          throw new PlatformError(400, 'SCOPE_GRANT_ID_REQUIRED', 'scope grant revoke requires scopeGrantId');
        }
        const current = await repository.getScopeGrant(scopeGrantId);
        if (!current) {
          throw new PlatformError(404, 'SCOPE_GRANT_NOT_FOUND', 'scope grant not found');
        }
        scopeGrant = await repository.updateScopeGrant({
          ...current,
          status: 'revoked',
          updatedBy: actorRef,
          updatedAt: timestamp,
        });
        break;
      }
      default:
        throw new PlatformError(409, 'GOVERNANCE_REQUEST_KIND_NOT_SUPPORTED', 'request kind is not supported');
    }

    const applied = await repository.updateGovernanceChangeRequest({
      ...request,
      status: 'applied',
      updatedAt: timestamp,
    });
    return {
      schemaVersion: 'v1',
      request: applied,
      decision,
      agent,
      triggerBinding,
      policyBinding,
      scopeGrant,
    };
  }

  private async collectPolicyBindingsForTrigger(
    repository: GovernanceRepository,
    triggerBinding: TriggerBindingRecord,
  ): Promise<PolicyBindingRecord[]> {
    const agentBindings = await repository.listPolicyBindingsForTarget('agent_definition', triggerBinding.agentId);
    const triggerBindings = await repository.listPolicyBindingsForTarget('trigger_binding', triggerBinding.triggerBindingId);
    return [...agentBindings, ...triggerBindings];
  }

  private async collectScopeGrantsForTrigger(
    repository: GovernanceRepository,
    triggerBinding: TriggerBindingRecord,
  ): Promise<ScopeGrantRecord[]> {
    const agentGrants = await repository.listScopeGrantsForTarget('agent_definition', triggerBinding.agentId);
    const triggerGrants = await repository.listScopeGrantsForTarget('trigger_binding', triggerBinding.triggerBindingId);
    return [...agentGrants, ...triggerGrants];
  }

  private async findGrantForSecret(
    triggerBinding: TriggerBindingRecord,
    secretRefId: string,
  ): Promise<ScopeGrantRecord | undefined> {
    const grants = await this.collectScopeGrantsForTrigger(this.governanceRepository, triggerBinding);
    return grants.find((grant) => grant.resourceRef === secretRefId && grant.status === 'active');
  }

  private async isTriggerBindingRunnable(
    agent: AgentDefinitionRecord,
    triggerBinding: TriggerBindingRecord,
    repository: GovernanceRepository = this.governanceRepository,
  ): Promise<boolean> {
    const policyBindings = await this.collectPolicyBindingsForTrigger(repository, triggerBinding);
    const scopeGrants = await this.collectScopeGrantsForTrigger(repository, triggerBinding);
    const basicRunnable = isTriggerRunnable(agent.activationState, triggerBinding.status, policyBindings, scopeGrants);
    if (!basicRunnable) {
      return false;
    }
    const secretRefId = normalizeString(triggerBinding.configJson.secretRefId);
    if (!secretRefId) {
      return true;
    }
    const secretRef = await repository.getSecretRef(secretRefId);
    const scopeGrant = scopeGrants.find((grant) => grant.resourceRef === secretRefId && grant.status === 'active');
    return isSecretUsable(secretRef, scopeGrant, secretRef?.environmentScope || '*');
  }

  private async dispatchTrigger(
    sourceType: TriggerDispatchRecord['sourceType'],
    triggerBindingId: string,
    input: TriggerDispatchRequest,
  ): Promise<TriggerDispatchResponse> {
    const existing = await this.governanceRepository.getTriggerDispatchByKey(input.dispatchKey);
    if (existing) {
      return {
        schemaVersion: 'v1',
        triggerDispatch: existing,
        runId: existing.runId,
        duplicate: true,
      };
    }

    const claimed: (
      | { existing: TriggerDispatchRecord }
      | { dispatch: TriggerDispatchRecord; triggerBinding: TriggerBindingRecord; agent: AgentDefinitionRecord }
    ) = await this.governanceRepository.runInTransaction(async (repository) => {
      const already = await repository.getTriggerDispatchByKey(input.dispatchKey);
      if (already) {
        return { existing: already };
      }
      await repository.lockTriggerBinding(triggerBindingId);
      const triggerBinding = await repository.getTriggerBinding(triggerBindingId);
      if (!triggerBinding) {
        throw new PlatformError(404, 'TRIGGER_BINDING_NOT_FOUND', 'trigger binding not found');
      }
      const agent = await repository.getAgent(triggerBinding.agentId);
      if (!agent) {
        throw new PlatformError(404, 'AGENT_NOT_FOUND', 'agent not found');
      }
      if ((await this.isTriggerBindingRunnable(agent, triggerBinding, repository)) === false) {
        throw new PlatformError(409, 'TRIGGER_NOT_RUNNABLE', 'trigger is not runnable');
      }
      const dispatch = await repository.createTriggerDispatch({
        triggerDispatchId: this.uuid(),
        triggerBindingId,
        dispatchKey: input.dispatchKey,
        sourceType,
        status: 'pending',
        payloadJson: input.payload,
        createdAt: this.now(),
        updatedAt: this.now(),
      });
      return { dispatch, triggerBinding, agent };
    });

    if ('existing' in claimed) {
      return {
        schemaVersion: 'v1',
        triggerDispatch: claimed.existing,
        runId: claimed.existing.runId,
        duplicate: true,
      };
    }

    try {
      const workflowVersion = await this.requirePublishedVersion(claimed.agent.templateVersionRef);
      const workflowDetail = await this.repository.getWorkflow(workflowVersion.workflowId);
      if (!workflowDetail) {
        throw new PlatformError(404, 'WORKFLOW_NOT_FOUND', 'workflow not found');
      }
      const runResponse = await this.startManagedAgentRun({
        agent: claimed.agent,
        workflowDetail,
        workflowVersion,
        traceId: this.uuid(),
        sessionId: `agent:${claimed.agent.agentId}`,
        userId: claimed.agent.ownerActorRef || claimed.agent.createdBy,
        inputPayload: {
          trigger: {
            triggerBindingId,
            dispatchKey: input.dispatchKey,
            sourceType,
            firedAt: input.firedAt,
            headers: input.headers || {},
          },
          input: input.payload || {},
        },
        sourceType,
        sourceRef: triggerBindingId,
        runtimeMetadata: {
          triggerBindingId,
          dispatchKey: input.dispatchKey,
          headers: input.headers || {},
        },
      });
      const updatedDispatch = await this.governanceRepository.runInTransaction(async (repository) => {
        await repository.lockTriggerBinding(triggerBindingId);
        const latestTriggerBinding = await repository.getTriggerBinding(triggerBindingId);
        if (!latestTriggerBinding) {
          throw new PlatformError(404, 'TRIGGER_BINDING_NOT_FOUND', 'trigger binding not found');
        }
        const nextTriggerAt = latestTriggerBinding.triggerKind === 'schedule'
          ? computeNextScheduleTriggerAt(latestTriggerBinding.configJson, input.firedAt)
          : undefined;
        await repository.updateTriggerBinding({
          ...latestTriggerBinding,
          lastTriggeredAt: input.firedAt,
          nextTriggerAt,
          lastError: undefined,
          updatedBy: claimed.agent.ownerActorRef || claimed.agent.createdBy,
          updatedAt: this.now(),
        });
        return await repository.updateTriggerDispatch({
          ...claimed.dispatch,
          status: 'dispatched',
          runId: runResponse.run.run.runId,
          updatedAt: this.now(),
        });
      });
      return {
        schemaVersion: 'v1',
        triggerDispatch: updatedDispatch,
        runId: updatedDispatch.runId,
        duplicate: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.governanceRepository.runInTransaction(async (repository) => {
        const latest = await repository.getTriggerBinding(triggerBindingId);
        if (latest) {
          await repository.updateTriggerBinding({
            ...latest,
            lastError: message,
            updatedBy: claimed.agent.ownerActorRef || claimed.agent.createdBy,
            updatedAt: this.now(),
          });
        }
        await repository.updateTriggerDispatch({
          ...claimed.dispatch,
          status: 'failed',
          errorMessage: message,
          updatedAt: this.now(),
        });
      });
      throw error;
    }
  }

  private normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  private normalizeRecipeSteps(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
      return [];
    }

    const steps: Array<Record<string, unknown>> = [];
    for (const [index, item] of value.entries()) {
      if (isRecord(item)) {
        const title = sanitizeText(typeof item.title === 'string' ? item.title : undefined)
          || sanitizeText(typeof item.label === 'string' ? item.label : undefined)
          || `Step ${index + 1}`;
        steps.push({
          ...item,
          stepKey: sanitizeText(typeof item.stepKey === 'string' ? item.stepKey : undefined) || `step-${index + 1}`,
          title,
        });
        continue;
      }

      const title = sanitizeText(String(item));
      if (!title) {
        continue;
      }
      steps.push({
        stepKey: `step-${index + 1}`,
        title,
      });
    }
    return steps;
  }

  private async persistDraftMutation(
    repository: PlatformRepository,
    params: {
      draft: WorkflowDraftRecord;
      revision: DraftRevisionRecord;
      sessionId: string;
      userId: string;
      createDraft?: boolean;
    },
  ): Promise<WorkflowDraftMutateResponse> {
    const draft = params.createDraft
      ? await repository.createDraft(params.draft)
      : await repository.updateDraft(params.draft);
    const revision = await repository.createDraftRevision(params.revision);
    const sessionLinks = await repository.setActiveDraft(
      params.sessionId,
      params.draft.draftId,
      params.userId,
      params.draft.updatedAt,
    );
    const sessionDrafts = await repository.listDraftsBySession(params.sessionId);
    return {
      schemaVersion: 'v1',
      draft,
      revision,
      sessionDrafts: sessionDrafts.drafts,
      sessionLinks,
    };
  }

  private async requireEditableSessionDraftFrom(
    repository: PlatformRepository,
    draftId: string,
    sessionId: string,
  ): Promise<WorkflowDraftRecord> {
    const draft = await repository.getDraft(draftId);
    if (!draft) {
      throw new PlatformError(404, 'DRAFT_NOT_FOUND', 'draft not found');
    }
    const link = await repository.getSessionLink(sessionId, draftId);
    if (!link) {
      throw new PlatformError(404, 'DRAFT_NOT_IN_SESSION', 'draft is not linked to the session');
    }
    if (isWorkflowDraftTerminal(draft.status)) {
      throw new PlatformError(409, 'DRAFT_TERMINAL', 'draft is already terminal');
    }
    return draft;
  }
}

export function createPlatformService(deps: PlatformServiceDeps): PlatformService {
  return new PlatformService(deps);
}
