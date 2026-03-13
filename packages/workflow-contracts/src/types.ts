import type { InteractionEvent } from '@baseinterface/contracts';
import type { ConnectorActionExecutionSnapshot } from './connector-runtime';
import type { ExternalRuntimeBridgeSnapshot } from './external-runtime-bridge';

export type WorkflowSchemaVersion = 'v1';

export type WorkflowRunStatus =
  | 'created'
  | 'running'
  | 'waiting_input'
  | 'waiting_approval'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type WorkflowNodeRunStatus =
  | 'created'
  | 'scheduled'
  | 'running'
  | 'waiting_input'
  | 'waiting_approval'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ApprovalRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export type ArtifactState =
  | 'draft'
  | 'validated'
  | 'review_required'
  | 'published'
  | 'superseded'
  | 'archived';

export type ActorMembershipStatus =
  | 'proposed'
  | 'pending_confirmation'
  | 'active'
  | 'revoked'
  | 'expired';

export type AudienceSelectorState =
  | 'draft'
  | 'validated'
  | 'bound'
  | 'superseded'
  | 'archived';

export type DeliverySpecStatus =
  | 'draft'
  | 'validated'
  | 'active'
  | 'superseded'
  | 'archived';

export type DeliveryMode = 'manual_handoff' | 'assisted_delivery' | 'auto_delivery';

export type DeliveryTargetStatus =
  | 'pending_resolution'
  | 'ready'
  | 'blocked'
  | 'delivered'
  | 'failed'
  | 'cancelled';

export type WorkflowNodeType = 'executor' | 'approval_gate' | 'end';

export type WorkflowTransitionKey =
  | 'success'
  | 'needs_input'
  | 'needs_approval'
  | 'approved'
  | 'rejected'
  | 'failed';

export type WorkflowNodeSpec = {
  nodeKey: string;
  nodeType: WorkflowNodeType;
  executorId?: string;
  config?: Record<string, unknown>;
  transitions?: Partial<Record<WorkflowTransitionKey, string>>;
};

export type WorkflowTemplateSpec = {
  schemaVersion: WorkflowSchemaVersion;
  workflowKey: string;
  name: string;
  compatProviderId: string;
  entryNode: string;
  nodes: WorkflowNodeSpec[];
  metadata?: Record<string, unknown>;
};

export type WorkflowDraftStatus =
  | 'created'
  | 'collecting_input'
  | 'synthesized'
  | 'editable'
  | 'validating'
  | 'publishable'
  | 'published'
  | 'superseded'
  | 'archived';

export type RecipeDraftStatus =
  | 'captured'
  | 'structured'
  | 'review_required'
  | 'approved_for_promotion'
  | 'promoted'
  | 'rejected'
  | 'archived';

export type DraftSource =
  | 'builder_quick_entry'
  | 'builder_text_entry'
  | 'chat_intake'
  | 'builder_synthesize'
  | 'builder_validate'
  | 'builder_publish'
  | 'console_edit'
  | 'run_derived_recipe';

export type WorkflowDraftSpec = {
  schemaVersion: WorkflowSchemaVersion;
  workflowKey?: string;
  name?: string;
  compatProviderId?: string;
  entryNode?: string;
  nodes?: WorkflowNodeSpec[];
  metadata?: Record<string, unknown>;
  requirements?: string[];
};

export type DraftValidationSummary = {
  isPublishable: boolean;
  errors: string[];
  warnings: string[];
  checkedAt: number;
};

export type WorkflowDraftRecord = {
  draftId: string;
  workflowKey?: string;
  name?: string;
  status: WorkflowDraftStatus;
  basedOnTemplateVersionId?: string;
  publishedTemplateVersionId?: string;
  currentSpec: WorkflowDraftSpec;
  latestValidationSummary?: DraftValidationSummary;
  publishable: boolean;
  activeRevisionNumber: number;
  createdAt: number;
  updatedAt: number;
};

export type DraftRevisionRecord = {
  revisionId: string;
  draftId: string;
  revisionNumber: number;
  source: DraftSource;
  actorId: string;
  changeSummary: string;
  specSnapshot: WorkflowDraftSpec;
  validationSummary?: DraftValidationSummary;
  createdAt: number;
};

export type WorkflowDraftSessionLinkRecord = {
  sessionId: string;
  draftId: string;
  userId: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  lastFocusedAt?: number;
};

export type RecipeDraftRecord = {
  recipeDraftId: string;
  title?: string;
  status: RecipeDraftStatus;
  sourceArtifactId?: string;
  sourceRefs: Array<Record<string, unknown>>;
  normalizedSteps: Array<Record<string, unknown>>;
  assumptions: string[];
  reviewerNotes: string[];
  createdAt: number;
  updatedAt: number;
};

export type WorkflowCompatArtifactSeed = {
  artifactType: string;
  state?: ArtifactState;
  schemaRef?: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type WorkflowCompatActorProfileSeed = {
  actorId: string;
  workspaceId: string;
  status: ActorProfileRecord['status'];
  displayName: string;
  actorType: ActorProfileRecord['actorType'];
  payloadJson?: Record<string, unknown>;
};

export type WorkflowCompatActorMembershipSeed = {
  actorMembershipId: string;
  fromActorId: string;
  toActorId: string;
  relationType: string;
  status: ActorMembershipStatus;
  confirmedAt?: number;
  payloadJson?: Record<string, unknown>;
};

export type WorkflowCompatAudienceSelectorSeed = {
  audienceSelectorId: string;
  status: AudienceSelectorState;
  selectorJson: Record<string, unknown>;
};

export type WorkflowCompatDeliverySpecSeed = {
  deliverySpecId: string;
  audienceSelectorId: string;
  reviewRequired: boolean;
  deliveryMode: DeliveryMode;
  status: DeliverySpecStatus;
  configJson?: Record<string, unknown>;
};

export type WorkflowCompatDeliveryTargetSeed = {
  deliveryTargetId: string;
  deliverySpecId: string;
  targetActorId?: string;
  status: DeliveryTargetStatus;
  payloadJson?: Record<string, unknown>;
};

export type WorkflowCompatCompletionMetadata = {
  artifacts?: WorkflowCompatArtifactSeed[];
  actorProfiles?: WorkflowCompatActorProfileSeed[];
  actorMemberships?: WorkflowCompatActorMembershipSeed[];
  audienceSelector?: WorkflowCompatAudienceSelectorSeed;
  deliverySpec?: WorkflowCompatDeliverySpecSeed;
  deliveryTargets?: WorkflowCompatDeliveryTargetSeed[];
};

export type WorkflowCompatContextEnvelope = {
  nodeKey: string;
  nodeType: WorkflowNodeType;
  nodeConfig?: Record<string, unknown>;
  runInput?: Record<string, unknown>;
  upstreamArtifactRefs: Array<{
    artifactId: string;
    artifactType: string;
    state: ArtifactState;
  }>;
};

export type WorkflowTemplateRecord = {
  workflowId: string;
  workflowKey: string;
  name: string;
  compatProviderId: string;
  status: 'active' | 'archived';
  createdAt: number;
  updatedAt: number;
};

export type WorkflowTemplateVersionRecord = {
  templateVersionId: string;
  workflowId: string;
  workflowKey: string;
  version: number;
  status: 'published' | 'superseded' | 'archived';
  spec: WorkflowTemplateSpec;
  createdAt: number;
};

export type WorkflowNodeRunRecord = {
  nodeRunId: string;
  runId: string;
  nodeKey: string;
  nodeType: WorkflowNodeType;
  status: WorkflowNodeRunStatus;
  executorId?: string;
  attempt: number;
  waitKey?: string;
  taskId?: string;
  questionId?: string;
  replyToken?: string;
  compatTaskState?: 'collecting' | 'ready' | 'executing' | 'completed' | 'failed';
  executionPolicy?: 'auto_execute' | 'require_user_confirm';
  inputJson?: Record<string, unknown>;
  outputArtifactId?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type WorkflowRunRecord = {
  runId: string;
  workflowId: string;
  workflowKey: string;
  templateVersionId: string;
  compatProviderId: string;
  status: WorkflowRunStatus;
  sessionId: string;
  userId: string;
  currentNodeRunId?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
};

export type WorkflowArtifactRecord = {
  artifactId: string;
  runId: string;
  nodeRunId?: string;
  artifactType: string;
  state: ArtifactState;
  schemaRef?: string;
  payloadJson: Record<string, unknown>;
  metadataJson?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type WorkflowApprovalRequestRecord = {
  approvalRequestId: string;
  runId: string;
  nodeRunId?: string;
  artifactId?: string;
  status: ApprovalRequestStatus;
  requestedActorId?: string;
  expiresAt?: number;
  payloadJson?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type WorkflowApprovalDecisionRecord = {
  approvalDecisionId: string;
  approvalRequestId: string;
  decision: 'approved' | 'rejected';
  decidedActorId?: string;
  comment?: string;
  payloadJson?: Record<string, unknown>;
  createdAt: number;
};

export type ActorProfileRecord = {
  runId: string;
  actorId: string;
  workspaceId: string;
  status: 'active' | 'inactive' | 'archived';
  displayName: string;
  actorType: 'person' | 'org' | 'cohort' | 'workspace' | 'external_contact';
  payloadJson?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type ActorMembershipRecord = {
  runId: string;
  actorMembershipId: string;
  fromActorId: string;
  toActorId: string;
  relationType: string;
  status: ActorMembershipStatus;
  confirmedAt?: number;
  payloadJson?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type AudienceSelectorRecord = {
  audienceSelectorId: string;
  status: AudienceSelectorState;
  selectorJson: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type DeliverySpecRecord = {
  deliverySpecId: string;
  audienceSelectorId: string;
  reviewRequired: boolean;
  deliveryMode: DeliveryMode;
  status: DeliverySpecStatus;
  configJson?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type DeliveryTargetRecord = {
  deliveryTargetId: string;
  runId: string;
  deliverySpecId: string;
  targetActorId?: string;
  status: DeliveryTargetStatus;
  payloadJson?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type WorkflowRunSnapshot = {
  run: WorkflowRunRecord;
  nodeRuns: WorkflowNodeRunRecord[];
  approvals: WorkflowApprovalRequestRecord[];
  approvalDecisions: WorkflowApprovalDecisionRecord[];
  artifacts: WorkflowArtifactRecord[];
  actorProfiles: ActorProfileRecord[];
  actorMemberships: ActorMembershipRecord[];
  audienceSelectors: AudienceSelectorRecord[];
  deliverySpecs: DeliverySpecRecord[];
  deliveryTargets: DeliveryTargetRecord[];
};

export type WorkflowRunSummary = {
  runId: string;
  workflowId: string;
  workflowKey: string;
  templateVersionId: string;
  compatProviderId: string;
  status: WorkflowRunStatus;
  sessionId: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  currentNodeRunId?: string;
  currentNodeKey?: string;
  currentNodeType?: WorkflowNodeType;
  currentNodeStatus?: WorkflowNodeRunStatus;
  blocker: 'waiting_input' | 'waiting_approval' | 'failed' | 'paused' | null;
  pendingApprovalCount: number;
  deliverySummary: {
    pendingResolution: number;
    ready: number;
    blocked: number;
    delivered: number;
    failed: number;
    cancelled: number;
  };
  artifactTypes: string[];
  requestedActorIds: string[];
};

export type WorkflowArtifactDetail = {
  artifact: WorkflowArtifactRecord;
  typedPayload: Record<string, unknown>;
  lineage: Record<string, unknown>;
};

export type WorkflowApprovalQueueItem = {
  approvalRequestId: string;
  runId: string;
  workflowKey: string;
  templateVersionId: string;
  compatProviderId: string;
  runStatus: WorkflowRunStatus;
  nodeRunId?: string;
  nodeKey?: string;
  status: ApprovalRequestStatus;
  requestedActorId?: string;
  approverDisplayName?: string;
  artifactId?: string;
  artifactIds: string[];
  artifactTypes: string[];
  createdAt: number;
  updatedAt: number;
};

export type WorkflowFormalEventBase = {
  schemaVersion: WorkflowSchemaVersion;
  eventId: string;
  traceId: string;
  runId: string;
  compatProviderId: string;
  timestampMs: number;
};

export type WorkflowFormalEvent =
  | (WorkflowFormalEventBase & {
      kind: 'compat_interaction';
      payload: {
        interaction: InteractionEvent;
      };
    })
  | (WorkflowFormalEventBase & {
      kind: 'run_state';
      payload: {
        status: WorkflowRunStatus;
      };
    })
  | (WorkflowFormalEventBase & {
      kind: 'node_state';
      payload: {
        nodeRunId: string;
        nodeKey: string;
        nodeType: WorkflowNodeType;
        status: WorkflowNodeRunStatus;
        compatTaskState?: 'collecting' | 'ready' | 'executing' | 'completed' | 'failed';
        executionPolicy?: 'auto_execute' | 'require_user_confirm';
        taskId?: string;
        metadata?: Record<string, unknown>;
      };
    })
  | (WorkflowFormalEventBase & {
      kind: 'waiting_input';
      payload: {
        nodeRunId: string;
        nodeKey: string;
        taskId: string;
        questionId: string;
        replyToken: string;
        prompt: string;
        answerSchema: Record<string, unknown>;
        uiSchema: Record<string, unknown>;
        metadata?: Record<string, unknown>;
      };
    })
  | (WorkflowFormalEventBase & {
      kind: 'approval_requested';
      payload: {
        approvalRequestId: string;
        nodeRunId: string;
        taskId: string;
        prompt: string;
      };
    })
  | (WorkflowFormalEventBase & {
      kind: 'approval_decided';
      payload: {
        approvalRequestId: string;
        decision: 'approved' | 'rejected';
      };
    })
  | (WorkflowFormalEventBase & {
      kind: 'artifact_created';
      payload: {
        artifactId: string;
        artifactType: string;
        state: ArtifactState;
      };
    })
  | (WorkflowFormalEventBase & {
      kind: 'checkpoint';
      payload: {
        nodeRunId: string;
        nodeKey: string;
        sequence: number;
        externalSessionRef: string;
        metadata?: Record<string, unknown>;
      };
    });

export type WorkflowCreateRequest = {
  schemaVersion: WorkflowSchemaVersion;
  workflowKey: string;
  name: string;
  compatProviderId: string;
  spec: WorkflowTemplateSpec;
};

export type WorkflowCreateResponse = {
  schemaVersion: WorkflowSchemaVersion;
  workflow: WorkflowTemplateRecord;
  version: WorkflowTemplateVersionRecord;
};

export type WorkflowDraftCreateRequest = {
  schemaVersion: WorkflowSchemaVersion;
  sessionId: string;
  userId: string;
  workflowKey?: string;
  name?: string;
  basedOnTemplateVersionId?: string;
  source?: DraftSource;
  initialText?: string;
};

export type WorkflowDraftFocusRequest = {
  schemaVersion: WorkflowSchemaVersion;
  sessionId: string;
  userId: string;
};

export type WorkflowDraftIntakeRequest = {
  schemaVersion: WorkflowSchemaVersion;
  sessionId: string;
  userId: string;
  text: string;
  source?: DraftSource;
};

export type WorkflowDraftMutateResponse = {
  schemaVersion: WorkflowSchemaVersion;
  draft: WorkflowDraftRecord;
  revision: DraftRevisionRecord;
  sessionDrafts: WorkflowDraftRecord[];
  sessionLinks: WorkflowDraftSessionLinkRecord[];
};

export type WorkflowDraftFocusResponse = {
  schemaVersion: WorkflowSchemaVersion;
  draft: WorkflowDraftRecord;
  sessionDrafts: WorkflowDraftRecord[];
  sessionLinks: WorkflowDraftSessionLinkRecord[];
};

export type WorkflowDraftListResponse = {
  schemaVersion: WorkflowSchemaVersion;
  drafts: WorkflowDraftRecord[];
  sessionLinks: WorkflowDraftSessionLinkRecord[];
};

export type WorkflowDraftDetailResponse = {
  schemaVersion: WorkflowSchemaVersion;
  draft: WorkflowDraftRecord;
  revisions: DraftRevisionRecord[];
  sessionLinks: WorkflowDraftSessionLinkRecord[];
};

export type WorkflowDraftPublishRequest = {
  schemaVersion: WorkflowSchemaVersion;
  sessionId: string;
  userId: string;
};

export type WorkflowDraftPublishResponse = {
  schemaVersion: WorkflowSchemaVersion;
  draft: WorkflowDraftRecord;
  workflow: WorkflowTemplateRecord;
  version: WorkflowTemplateVersionRecord;
  sessionDrafts: WorkflowDraftRecord[];
  sessionLinks: WorkflowDraftSessionLinkRecord[];
};

export type WorkflowDraftSpecPatch =
  | {
      section: 'metadata';
      value: {
        workflowKey?: string;
        name?: string;
        compatProviderId?: string;
        entryNode?: string;
      };
    }
  | {
      section: 'requirements';
      value: {
        requirements: string[];
      };
    }
  | {
      section: 'nodes';
      value: {
        entryNode?: string;
        nodes: WorkflowNodeSpec[];
      };
    };

export type WorkflowDraftSpecPatchRequest = {
  schemaVersion: WorkflowSchemaVersion;
  sessionId: string;
  userId: string;
  baseRevisionId: string;
  changeSummary: string;
  patch: WorkflowDraftSpecPatch;
};

export type WorkflowDraftSpecPatchResponse = {
  schemaVersion: WorkflowSchemaVersion;
  draft: WorkflowDraftRecord;
  revision: DraftRevisionRecord;
  sessionDrafts: WorkflowDraftRecord[];
  sessionLinks: WorkflowDraftSessionLinkRecord[];
};

export type RecipeDraftCreateRequest = {
  schemaVersion: WorkflowSchemaVersion;
  title?: string;
  sourceRefs?: Array<Record<string, unknown>>;
  normalizedSteps?: Array<Record<string, unknown>>;
  assumptions?: string[];
  reviewerNotes?: string[];
  status?: RecipeDraftStatus;
};

export type RecipeDraftUpdateRequest = {
  schemaVersion: WorkflowSchemaVersion;
  title?: string;
  sourceRefs?: Array<Record<string, unknown>>;
  normalizedSteps?: Array<Record<string, unknown>>;
  assumptions?: string[];
  reviewerNotes?: string[];
  status?: RecipeDraftStatus;
};

export type RecipeDraftResponse = {
  schemaVersion: WorkflowSchemaVersion;
  recipeDraft: RecipeDraftRecord;
};

export type RecipeDraftListResponse = {
  schemaVersion: WorkflowSchemaVersion;
  recipeDrafts: RecipeDraftRecord[];
};

export type WorkflowStartRequest = {
  schemaVersion: WorkflowSchemaVersion;
  traceId: string;
  sessionId: string;
  userId: string;
  workflowKey: string;
  templateVersionId?: string;
  inputText?: string;
  inputPayload?: Record<string, unknown>;
};

export type WorkflowResumeRequest = {
  schemaVersion: WorkflowSchemaVersion;
  traceId: string;
  sessionId: string;
  userId: string;
  runId: string;
  actionId: string;
  replyToken?: string;
  taskId?: string;
  payload?: Record<string, unknown>;
};

export type WorkflowCommandResponse = {
  schemaVersion: WorkflowSchemaVersion;
  run: WorkflowRunSnapshot;
  events: WorkflowFormalEvent[];
  capturedRecipeDrafts?: RecipeDraftRecord[];
};

export type WorkflowRunListResponse = {
  schemaVersion: WorkflowSchemaVersion;
  runs: WorkflowRunSummary[];
};

export type WorkflowApprovalQueueResponse = {
  schemaVersion: WorkflowSchemaVersion;
  approvals: WorkflowApprovalQueueItem[];
};

export type WorkflowApprovalDetailResponse = {
  schemaVersion: WorkflowSchemaVersion;
  approval: WorkflowApprovalRequestRecord;
  runSummary: WorkflowRunSummary;
  approverContext?: ActorProfileRecord;
  artifacts: WorkflowArtifactDetail[];
  decisions: WorkflowApprovalDecisionRecord[];
  capturedRecipeDrafts?: RecipeDraftRecord[];
};

export type WorkflowApprovalDecisionRequest = {
  schemaVersion: WorkflowSchemaVersion;
  traceId: string;
  userId: string;
  decision: 'approved' | 'rejected';
  comment?: string;
};

export type WorkflowApprovalDecisionResponse = {
  schemaVersion: WorkflowSchemaVersion;
  approval: WorkflowApprovalRequestRecord;
  decision: WorkflowApprovalDecisionRecord;
  run: WorkflowRunSnapshot;
  events: WorkflowFormalEvent[];
  capturedRecipeDrafts?: RecipeDraftRecord[];
};

export type WorkflowRunQueryResponse = {
  schemaVersion: WorkflowSchemaVersion;
  run: WorkflowRunSnapshot;
  capturedRecipeDrafts?: RecipeDraftRecord[];
};

export type WorkflowArtifactDetailResponse = {
  schemaVersion: WorkflowSchemaVersion;
  artifact: WorkflowArtifactRecord;
  typedPayload: Record<string, unknown>;
  lineage: Record<string, unknown>;
};

export type WorkflowConsoleStreamEvent = {
  schemaVersion: WorkflowSchemaVersion;
  eventId: string;
  timestampMs: number;
  kind: 'run.updated' | 'approval.updated' | 'draft.updated' | 'artifact.updated';
  runId?: string;
  approvalRequestId?: string;
  draftId?: string;
  artifactId?: string;
};

export type WorkflowConsoleStreamEnvelope = {
  schemaVersion: WorkflowSchemaVersion;
  type: 'control_console_event';
  event: WorkflowConsoleStreamEvent;
};

export type WorkflowConsoleHeartbeatEnvelope = {
  schemaVersion: WorkflowSchemaVersion;
  type: 'heartbeat';
  timestampMs: number;
};

export type WorkflowRuntimeStartRunRequest = {
  schemaVersion: WorkflowSchemaVersion;
  traceId: string;
  sessionId: string;
  userId: string;
  template: WorkflowTemplateRecord;
  version: WorkflowTemplateVersionRecord;
  inputText?: string;
  inputPayload?: Record<string, unknown>;
  agentId?: string;
  sourceType?: 'message' | 'manual' | 'schedule' | 'webhook' | 'event' | 'event_subscription';
  sourceRef?: string;
  runtimeMetadata?: Record<string, unknown>;
  connectorActions?: Record<string, ConnectorActionExecutionSnapshot>;
  externalRuntime?: ExternalRuntimeBridgeSnapshot;
};

export type WorkflowRuntimeResumeRunRequest = {
  schemaVersion: WorkflowSchemaVersion;
  traceId: string;
  sessionId: string;
  userId: string;
  runId: string;
  compatProviderId: string;
  actionId: string;
  replyToken?: string;
  taskId?: string;
  payload?: Record<string, unknown>;
};

export type WorkflowRuntimeCancelRunRequest = {
  schemaVersion: WorkflowSchemaVersion;
  traceId: string;
  userId: string;
  runId: string;
  reason?: string;
};

export type WorkflowEventProjectionRequest = {
  schemaVersion: WorkflowSchemaVersion;
  traceId: string;
  sessionId: string;
  userId: string;
  compatProviderId: string;
  runId: string;
  events: WorkflowFormalEvent[];
};

export type WorkflowEntryRegistryEntry = {
  compatProviderId: string;
  workflowKey: string;
  matchKeywords: string[];
  enabled: boolean;
  defaultExecutorId: string;
  defaultTemplateVersionRef?: string;
};

export function isWorkflowRunTerminal(status: WorkflowRunStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function isWorkflowNodeTerminal(status: WorkflowNodeRunStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function isWorkflowDraftTerminal(status: WorkflowDraftStatus): boolean {
  return status === 'published' || status === 'superseded' || status === 'archived';
}

export function isRecipeDraftTerminal(status: RecipeDraftStatus): boolean {
  return status === 'promoted' || status === 'rejected' || status === 'archived';
}
