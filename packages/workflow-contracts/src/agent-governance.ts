import type { WorkflowSchemaVersion } from './types';

export type AgentActivationState =
  | 'draft'
  | 'validated'
  | 'approved'
  | 'active'
  | 'suspended'
  | 'retired'
  | 'archived';

export type TriggerKind = 'schedule' | 'webhook' | 'event_subscription';

export type TriggerBindingStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'enabled'
  | 'disabled'
  | 'revoked'
  | 'archived';

export type PolicyBindingStatus = 'draft' | 'active' | 'revoked' | 'archived';

export type SecretRefStatus = 'active' | 'disabled' | 'archived';

export type ScopeGrantStatus = 'pending' | 'active' | 'revoked' | 'expired';

export type GovernanceRiskLevel = 'R0' | 'R1' | 'R2';

export type PolicyKind = 'approval' | 'invoke' | 'delivery' | 'visibility' | 'browser_fallback';

export type GovernanceTargetType =
  | 'agent_definition'
  | 'trigger_binding'
  | 'policy_binding'
  | 'secret_ref'
  | 'scope_grant';

export type GovernanceRequestKind =
  | 'agent_activate'
  | 'trigger_enable'
  | 'policy_bind_apply'
  | 'secret_grant_issue'
  | 'scope_grant_issue'
  | 'scope_widen'
  | 'external_write_allow'
  | 'agent_suspend'
  | 'agent_retire'
  | 'trigger_disable'
  | 'scope_grant_revoke';

export type GovernanceChangeRequestStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'applied'
  | 'failed'
  | 'expired';

export type GovernanceDecision = 'approved' | 'rejected';

export type ExecutorStrategy = 'platform_runtime' | 'external_runtime';

export type AgentDefinitionRecord = {
  agentId: string;
  workspaceId: string;
  templateVersionRef: string;
  name: string;
  description?: string;
  activationState: AgentActivationState;
  identityRef?: string;
  executorStrategy: ExecutorStrategy;
  toolProfile?: string;
  riskLevel?: GovernanceRiskLevel;
  ownerActorRef?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type TriggerBindingRecord = {
  triggerBindingId: string;
  workspaceId: string;
  agentId: string;
  triggerKind: TriggerKind;
  status: TriggerBindingStatus;
  configJson: Record<string, unknown>;
  publicTriggerKey?: string;
  lastTriggeredAt?: number;
  nextTriggerAt?: number;
  lastError?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type PolicyBindingRecord = {
  policyBindingId: string;
  workspaceId: string;
  policyKind: PolicyKind;
  targetType: GovernanceTargetType;
  targetRef: string;
  status: PolicyBindingStatus;
  configJson: Record<string, unknown>;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type SecretRefRecord = {
  secretRefId: string;
  workspaceId: string;
  environmentScope: string;
  providerType: string;
  status: SecretRefStatus;
  metadataJson: Record<string, unknown>;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type ScopeGrantRecord = {
  scopeGrantId: string;
  workspaceId: string;
  targetType: GovernanceTargetType;
  targetRef: string;
  resourceType: string;
  resourceRef: string;
  status: ScopeGrantStatus;
  scopeJson: Record<string, unknown>;
  expiresAt?: number;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type GovernanceChangeRequestRecord = {
  requestId: string;
  workspaceId: string;
  requestKind: GovernanceRequestKind;
  targetType: GovernanceTargetType;
  targetRef: string;
  requestedByActorId: string;
  status: GovernanceChangeRequestStatus;
  riskLevel: GovernanceRiskLevel;
  summary: string;
  justification?: string;
  desiredStateJson: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type GovernanceChangeDecisionRecord = {
  decisionId: string;
  requestId: string;
  actorRef: string;
  decision: GovernanceDecision;
  comment?: string;
  decidedAt: number;
};

export type TriggerDispatchRecord = {
  triggerDispatchId: string;
  triggerBindingId: string;
  dispatchKey: string;
  sourceType: 'schedule' | 'webhook';
  status: 'pending' | 'dispatched' | 'failed';
  runId?: string;
  payloadJson?: Record<string, unknown>;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
};

export type AgentDefinitionListResponse = {
  schemaVersion: WorkflowSchemaVersion;
  agents: AgentDefinitionRecord[];
};

export type AgentDefinitionResponse = {
  schemaVersion: WorkflowSchemaVersion;
  agent: AgentDefinitionRecord;
  governanceRequest?: GovernanceChangeRequestRecord;
};

export type AgentDefinitionCreateRequest = {
  schemaVersion: WorkflowSchemaVersion;
  workspaceId: string;
  templateVersionRef: string;
  name: string;
  createdBy: string;
  description?: string;
  identityRef?: string;
  executorStrategy?: ExecutorStrategy;
  toolProfile?: string;
  riskLevel?: GovernanceRiskLevel;
  ownerActorRef?: string;
};

export type AgentDefinitionLifecycleRequest = {
  schemaVersion: WorkflowSchemaVersion;
  userId: string;
  summary?: string;
  justification?: string;
};

export type TriggerBindingListResponse = {
  schemaVersion: WorkflowSchemaVersion;
  triggerBindings: TriggerBindingRecord[];
};

export type TriggerBindingResponse = {
  schemaVersion: WorkflowSchemaVersion;
  triggerBinding: TriggerBindingRecord;
  governanceRequest?: GovernanceChangeRequestRecord;
};

export type TriggerBindingCreateRequest = {
  schemaVersion: WorkflowSchemaVersion;
  workspaceId: string;
  userId: string;
  triggerKind: TriggerKind;
  configJson: Record<string, unknown>;
};

export type TriggerBindingLifecycleRequest = {
  schemaVersion: WorkflowSchemaVersion;
  userId: string;
  summary?: string;
  justification?: string;
};

export type PolicyBindingListResponse = {
  schemaVersion: WorkflowSchemaVersion;
  policyBindings: PolicyBindingRecord[];
};

export type PolicyBindingResponse = {
  schemaVersion: WorkflowSchemaVersion;
  policyBinding: PolicyBindingRecord;
};

export type PolicyBindingCreateRequest = {
  schemaVersion: WorkflowSchemaVersion;
  workspaceId: string;
  userId: string;
  policyKind: PolicyKind;
  targetType: GovernanceTargetType;
  targetRef: string;
  configJson: Record<string, unknown>;
};

export type SecretRefListResponse = {
  schemaVersion: WorkflowSchemaVersion;
  secretRefs: SecretRefRecord[];
};

export type SecretRefResponse = {
  schemaVersion: WorkflowSchemaVersion;
  secretRef: SecretRefRecord;
};

export type SecretRefCreateRequest = {
  schemaVersion: WorkflowSchemaVersion;
  workspaceId: string;
  userId: string;
  environmentScope: string;
  providerType: string;
  metadataJson?: Record<string, unknown>;
};

export type ScopeGrantListResponse = {
  schemaVersion: WorkflowSchemaVersion;
  scopeGrants: ScopeGrantRecord[];
};

export type GovernanceChangeRequestListResponse = {
  schemaVersion: WorkflowSchemaVersion;
  requests: GovernanceChangeRequestRecord[];
};

export type GovernanceChangeRequestDetailResponse = {
  schemaVersion: WorkflowSchemaVersion;
  request: GovernanceChangeRequestRecord;
  decisions: GovernanceChangeDecisionRecord[];
};

export type GovernanceChangeRequestResponse = {
  schemaVersion: WorkflowSchemaVersion;
  request: GovernanceChangeRequestRecord;
};

export type GovernanceChangeDecisionResponse = {
  schemaVersion: WorkflowSchemaVersion;
  request: GovernanceChangeRequestRecord;
  decision: GovernanceChangeDecisionRecord;
  agent?: AgentDefinitionRecord;
  triggerBinding?: TriggerBindingRecord;
  policyBinding?: PolicyBindingRecord;
  scopeGrant?: ScopeGrantRecord;
};

export type GovernanceChangeRequestCreateRequest = {
  schemaVersion: WorkflowSchemaVersion;
  workspaceId: string;
  requestKind: GovernanceRequestKind;
  targetType: GovernanceTargetType;
  targetRef: string;
  requestedByActorId: string;
  riskLevel: GovernanceRiskLevel;
  summary: string;
  justification?: string;
  desiredStateJson?: Record<string, unknown>;
};

export type GovernanceChangeDecisionRequest = {
  schemaVersion: WorkflowSchemaVersion;
  actorRef: string;
  comment?: string;
};

export type DueScheduleTrigger = {
  triggerBindingId: string;
  agentId: string;
  workspaceId: string;
  nextTriggerAt: number;
  configJson: Record<string, unknown>;
};

export type DueScheduleTriggerListResponse = {
  schemaVersion: WorkflowSchemaVersion;
  triggers: DueScheduleTrigger[];
};

export type WebhookTriggerRuntimeConfig = {
  triggerBindingId: string;
  agentId: string;
  workspaceId: string;
  publicTriggerKey: string;
  secretRefId: string;
  secretEnvKey: string;
  signatureHeader: string;
  timestampHeader: string;
  dedupeHeader: string;
  replayWindowMs: number;
};

export type WebhookTriggerRuntimeConfigResponse = {
  schemaVersion: WorkflowSchemaVersion;
  trigger: WebhookTriggerRuntimeConfig;
};

export type TriggerDispatchRequest = {
  schemaVersion: WorkflowSchemaVersion;
  dispatchKey: string;
  firedAt: number;
  payload?: Record<string, unknown>;
  headers?: Record<string, string>;
};

export type TriggerDispatchResponse = {
  schemaVersion: WorkflowSchemaVersion;
  triggerDispatch: TriggerDispatchRecord;
  runId?: string;
  duplicate?: boolean;
};

export function isGovernanceChangeTerminal(status: GovernanceChangeRequestStatus): boolean {
  return status === 'applied'
    || status === 'rejected'
    || status === 'cancelled'
    || status === 'failed'
    || status === 'expired';
}
