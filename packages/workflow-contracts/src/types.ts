import type { InteractionEvent } from '@baseinterface/contracts';

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
  artifacts: WorkflowArtifactRecord[];
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
