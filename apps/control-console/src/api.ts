import type {
  ActionBindingCreateRequest,
  ActionBindingListResponse,
  ActionBindingResponse,
  AgentDefinitionCreateRequest,
  AgentDefinitionLifecycleRequest,
  AgentDefinitionListResponse,
  AgentDefinitionResponse,
  AgentRunStartRequest,
  BridgeRegistrationCreateRequest,
  BridgeRegistrationLifecycleRequest,
  BridgeRegistrationListResponse,
  BridgeRegistrationResponse,
  ConnectorBindingCreateRequest,
  ConnectorBindingListResponse,
  ConnectorBindingResponse,
  ConnectorDefinitionCreateRequest,
  ConnectorDefinitionListResponse,
  ConnectorDefinitionResponse,
  EventSubscriptionCreateRequest,
  EventSubscriptionListResponse,
  EventSubscriptionResponse,
  GovernanceChangeDecisionRequest,
  GovernanceChangeDecisionResponse,
  GovernanceChangeRequestCreateRequest,
  GovernanceChangeRequestDetailResponse,
  GovernanceChangeRequestListResponse,
  GovernanceChangeRequestResponse,
  PolicyBindingCreateRequest,
  PolicyBindingListResponse,
  PolicyBindingResponse,
  ScopeGrantListResponse,
  SecretRefCreateRequest,
  SecretRefListResponse,
  SecretRefResponse,
  TriggerBindingCreateRequest,
  TriggerBindingLifecycleRequest,
  TriggerBindingListResponse,
  TriggerBindingResponse,
  WorkflowArtifactDetailResponse,
  WorkflowApprovalDecisionRequest,
  WorkflowApprovalDecisionResponse,
  WorkflowApprovalDetailResponse,
  WorkflowApprovalQueueResponse,
  WorkflowCommandResponse,
  WorkflowConsoleHeartbeatEnvelope,
  WorkflowConsoleStreamEnvelope,
  WorkflowDetailResponse,
  WorkflowDraftCreateRequest,
  WorkflowDraftDetailResponse,
  WorkflowDraftFocusRequest,
  WorkflowDraftFocusResponse,
  WorkflowDraftIntakeRequest,
  WorkflowDraftListResponse,
  WorkflowDraftMutateResponse,
  WorkflowDraftPublishRequest,
  WorkflowDraftPublishResponse,
  WorkflowDraftSpecPatchRequest,
  WorkflowDraftSpecPatchResponse,
  WorkflowRunListResponse,
  WorkflowRunQueryResponse,
  WorkflowTemplateListResponse,
  WorkflowVersionRunStartRequest,
} from '@baseinterface/workflow-contracts';
import { CONTROL_CONSOLE_API_BASE_URL } from './config';

export class ControlConsoleApiError extends Error {
  readonly statusCode: number;

  readonly errorCode?: string;

  constructor(message: string, statusCode: number, errorCode?: string) {
    super(message);
    this.name = 'ControlConsoleApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

type FetchOptions = RequestInit & {
  bodyJson?: unknown;
};

async function requestJson<T>(path: string, init: FetchOptions = {}): Promise<T> {
  const response = await fetch(`${CONTROL_CONSOLE_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
    body: init.bodyJson === undefined ? init.body : JSON.stringify(init.bodyJson),
  });

  const json = (await response.json().catch(() => undefined)) as {
    error?: string;
    code?: string;
  } | undefined;

  if (!response.ok) {
    throw new ControlConsoleApiError(
      json?.error || `request failed with status ${response.status}`,
      response.status,
      json?.code,
    );
  }

  return json as T;
}

export const queryKeys = {
  templates: ['templates'] as const,
  template: (workflowId: string) => ['templates', 'detail', workflowId] as const,
  runs: ['runs'] as const,
  run: (runId: string) => ['runs', 'detail', runId] as const,
  approvals: ['approvals'] as const,
  approval: (approvalRequestId: string) => ['approvals', 'detail', approvalRequestId] as const,
  artifact: (artifactId: string) => ['artifacts', 'detail', artifactId] as const,
  drafts: (scope: 'all' | string) => ['drafts', scope] as const,
  draft: (draftId: string, scope: 'all' | string) => ['drafts', scope, 'detail', draftId] as const,
  agents: ['agents'] as const,
  agent: (agentId: string) => ['agents', 'detail', agentId] as const,
  triggerBindings: (agentId: string) => ['agents', agentId, 'trigger-bindings'] as const,
  actionBindings: (agentId: string) => ['agents', agentId, 'action-bindings'] as const,
  connectorDefinitions: ['capabilities', 'connector-definitions'] as const,
  connectorDefinition: (connectorDefinitionId: string) => ['capabilities', 'connector-definitions', connectorDefinitionId] as const,
  connectorBindings: ['capabilities', 'connector-bindings'] as const,
  connectorBinding: (connectorBindingId: string) => ['capabilities', 'connector-bindings', connectorBindingId] as const,
  eventSubscriptions: ['capabilities', 'event-subscriptions'] as const,
  eventSubscription: (eventSubscriptionId: string) => ['capabilities', 'event-subscriptions', eventSubscriptionId] as const,
  bridges: ['capabilities', 'bridges'] as const,
  bridge: (bridgeId: string) => ['capabilities', 'bridges', bridgeId] as const,
  policyBindings: ['governance', 'policy-bindings'] as const,
  secretRefs: ['governance', 'secret-refs'] as const,
  scopeGrants: ['governance', 'scope-grants'] as const,
  governanceRequests: ['governance', 'requests'] as const,
  governanceRequest: (requestId: string) => ['governance', 'requests', requestId] as const,
};

export function buildConsoleStreamUrl(): string {
  return `${CONTROL_CONSOLE_API_BASE_URL}/v1/control-console/stream`;
}

export function parseConsoleStreamEnvelope(raw: string): WorkflowConsoleStreamEnvelope | undefined {
  try {
    const parsed = JSON.parse(raw) as WorkflowConsoleStreamEnvelope | WorkflowConsoleHeartbeatEnvelope;
    if (parsed.schemaVersion !== 'v1') {
      return undefined;
    }
    if (parsed.type === 'control_console_event') {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function getTemplates(): Promise<WorkflowTemplateListResponse> {
  return await requestJson('/v1/workflows', {
    method: 'GET',
  });
}

export async function getTemplate(workflowId: string): Promise<WorkflowDetailResponse> {
  return await requestJson(`/v1/workflows/${encodeURIComponent(workflowId)}`, {
    method: 'GET',
  });
}

export async function postStartDebugRun(body: WorkflowVersionRunStartRequest): Promise<WorkflowCommandResponse> {
  return await requestJson('/v1/runs', {
    method: 'POST',
    bodyJson: body,
  });
}

export async function getRuns(limit = 30): Promise<WorkflowRunListResponse> {
  return await requestJson(`/v1/runs?limit=${encodeURIComponent(String(limit))}`, {
    method: 'GET',
  });
}

export async function getRun(runId: string): Promise<WorkflowRunQueryResponse> {
  return await requestJson(`/v1/runs/${encodeURIComponent(runId)}`, {
    method: 'GET',
  });
}

export async function getApprovalQueue(): Promise<WorkflowApprovalQueueResponse> {
  return await requestJson('/v1/approvals/queue', {
    method: 'GET',
  });
}

export async function getApprovalDetail(approvalRequestId: string): Promise<WorkflowApprovalDetailResponse> {
  return await requestJson(`/v1/approvals/${encodeURIComponent(approvalRequestId)}`, {
    method: 'GET',
  });
}

export async function getArtifact(artifactId: string): Promise<WorkflowArtifactDetailResponse> {
  return await requestJson(`/v1/artifacts/${encodeURIComponent(artifactId)}`, {
    method: 'GET',
  });
}

export async function postApprovalDecision(
  approvalRequestId: string,
  body: WorkflowApprovalDecisionRequest,
): Promise<WorkflowApprovalDecisionResponse> {
  return await requestJson(`/v1/approvals/${encodeURIComponent(approvalRequestId)}/decision`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function getDrafts(sessionId?: string): Promise<WorkflowDraftListResponse> {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  return await requestJson(`/v1/workflow-drafts${query}`, {
    method: 'GET',
  });
}

export async function getDraft(draftId: string, sessionId?: string): Promise<WorkflowDraftDetailResponse> {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  return await requestJson(`/v1/workflow-drafts/${encodeURIComponent(draftId)}${query}`, {
    method: 'GET',
  });
}

export async function postCreateDraft(body: WorkflowDraftCreateRequest): Promise<WorkflowDraftMutateResponse> {
  return await requestJson('/v1/workflow-drafts', {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postFocusDraft(
  draftId: string,
  body: WorkflowDraftFocusRequest,
): Promise<WorkflowDraftFocusResponse> {
  return await requestJson(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/focus`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postDraftIntake(
  draftId: string,
  body: WorkflowDraftIntakeRequest,
): Promise<WorkflowDraftMutateResponse> {
  return await requestJson(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/intake`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postDraftSynthesize(
  draftId: string,
  body: WorkflowDraftFocusRequest,
): Promise<WorkflowDraftMutateResponse> {
  return await requestJson(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/synthesize`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postDraftValidate(
  draftId: string,
  body: WorkflowDraftFocusRequest,
): Promise<WorkflowDraftMutateResponse> {
  return await requestJson(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/validate`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function patchDraftSpec(
  draftId: string,
  body: WorkflowDraftSpecPatchRequest,
): Promise<WorkflowDraftSpecPatchResponse> {
  return await requestJson(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/spec`, {
    method: 'PATCH',
    bodyJson: body,
  });
}

export async function postDraftPublish(
  draftId: string,
  body: WorkflowDraftPublishRequest,
): Promise<WorkflowDraftPublishResponse> {
  return await requestJson(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/publish`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function getAgents(): Promise<AgentDefinitionListResponse> {
  return await requestJson('/v1/agents', {
    method: 'GET',
  });
}

export async function getAgent(agentId: string): Promise<AgentDefinitionResponse> {
  return await requestJson(`/v1/agents/${encodeURIComponent(agentId)}`, {
    method: 'GET',
  });
}

export async function postCreateAgent(body: AgentDefinitionCreateRequest): Promise<AgentDefinitionResponse> {
  return await requestJson('/v1/agents', {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postActivateAgent(
  agentId: string,
  body: AgentDefinitionLifecycleRequest,
): Promise<AgentDefinitionResponse> {
  return await requestJson(`/v1/agents/${encodeURIComponent(agentId)}/activate`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postSuspendAgent(
  agentId: string,
  body: AgentDefinitionLifecycleRequest,
): Promise<AgentDefinitionResponse> {
  return await requestJson(`/v1/agents/${encodeURIComponent(agentId)}/suspend`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postRetireAgent(
  agentId: string,
  body: AgentDefinitionLifecycleRequest,
): Promise<AgentDefinitionResponse> {
  return await requestJson(`/v1/agents/${encodeURIComponent(agentId)}/retire`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postStartAgentRun(
  agentId: string,
  body: AgentRunStartRequest,
): Promise<WorkflowCommandResponse> {
  return await requestJson(`/v1/agents/${encodeURIComponent(agentId)}/runs`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function getActionBindings(agentId: string): Promise<ActionBindingListResponse> {
  return await requestJson(`/v1/agents/${encodeURIComponent(agentId)}/action-bindings`, {
    method: 'GET',
  });
}

export async function getActionBinding(actionBindingId: string): Promise<ActionBindingResponse> {
  return await requestJson(`/v1/action-bindings/${encodeURIComponent(actionBindingId)}`, {
    method: 'GET',
  });
}

export async function postCreateActionBinding(
  agentId: string,
  body: ActionBindingCreateRequest,
): Promise<ActionBindingResponse> {
  return await requestJson(`/v1/agents/${encodeURIComponent(agentId)}/action-bindings`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function getTriggerBindings(agentId: string): Promise<TriggerBindingListResponse> {
  return await requestJson(`/v1/agents/${encodeURIComponent(agentId)}/trigger-bindings`, {
    method: 'GET',
  });
}

export async function postCreateTriggerBinding(
  agentId: string,
  body: TriggerBindingCreateRequest,
): Promise<TriggerBindingResponse> {
  return await requestJson(`/v1/agents/${encodeURIComponent(agentId)}/trigger-bindings`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postEnableTriggerBinding(
  triggerBindingId: string,
  body: TriggerBindingLifecycleRequest,
): Promise<TriggerBindingResponse> {
  return await requestJson(`/v1/trigger-bindings/${encodeURIComponent(triggerBindingId)}/enable`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postDisableTriggerBinding(
  triggerBindingId: string,
  body: TriggerBindingLifecycleRequest,
): Promise<TriggerBindingResponse> {
  return await requestJson(`/v1/trigger-bindings/${encodeURIComponent(triggerBindingId)}/disable`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function getConnectorDefinitions(): Promise<ConnectorDefinitionListResponse> {
  return await requestJson('/v1/connector-definitions', {
    method: 'GET',
  });
}

export async function getConnectorDefinition(connectorDefinitionId: string): Promise<ConnectorDefinitionResponse> {
  return await requestJson(`/v1/connector-definitions/${encodeURIComponent(connectorDefinitionId)}`, {
    method: 'GET',
  });
}

export async function postCreateConnectorDefinition(
  body: ConnectorDefinitionCreateRequest,
): Promise<ConnectorDefinitionResponse> {
  return await requestJson('/v1/connector-definitions', {
    method: 'POST',
    bodyJson: body,
  });
}

export async function getConnectorBindings(): Promise<ConnectorBindingListResponse> {
  return await requestJson('/v1/connector-bindings', {
    method: 'GET',
  });
}

export async function getConnectorBinding(connectorBindingId: string): Promise<ConnectorBindingResponse> {
  return await requestJson(`/v1/connector-bindings/${encodeURIComponent(connectorBindingId)}`, {
    method: 'GET',
  });
}

export async function postCreateConnectorBinding(
  body: ConnectorBindingCreateRequest,
): Promise<ConnectorBindingResponse> {
  return await requestJson('/v1/connector-bindings', {
    method: 'POST',
    bodyJson: body,
  });
}

export async function getEventSubscriptions(): Promise<EventSubscriptionListResponse> {
  return await requestJson('/v1/event-subscriptions', {
    method: 'GET',
  });
}

export async function getEventSubscription(eventSubscriptionId: string): Promise<EventSubscriptionResponse> {
  return await requestJson(`/v1/event-subscriptions/${encodeURIComponent(eventSubscriptionId)}`, {
    method: 'GET',
  });
}

export async function postCreateEventSubscription(
  body: EventSubscriptionCreateRequest,
): Promise<EventSubscriptionResponse> {
  return await requestJson('/v1/event-subscriptions', {
    method: 'POST',
    bodyJson: body,
  });
}

export async function getBridges(): Promise<BridgeRegistrationListResponse> {
  return await requestJson('/v1/bridge-registrations', {
    method: 'GET',
  });
}

export async function getBridge(bridgeId: string): Promise<BridgeRegistrationResponse> {
  return await requestJson(`/v1/bridge-registrations/${encodeURIComponent(bridgeId)}`, {
    method: 'GET',
  });
}

export async function postCreateBridge(
  body: BridgeRegistrationCreateRequest,
): Promise<BridgeRegistrationResponse> {
  return await requestJson('/v1/bridge-registrations', {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postActivateBridge(
  bridgeId: string,
  body: BridgeRegistrationLifecycleRequest,
): Promise<BridgeRegistrationResponse> {
  return await requestJson(`/v1/bridge-registrations/${encodeURIComponent(bridgeId)}/activate`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postSuspendBridge(
  bridgeId: string,
  body: BridgeRegistrationLifecycleRequest,
): Promise<BridgeRegistrationResponse> {
  return await requestJson(`/v1/bridge-registrations/${encodeURIComponent(bridgeId)}/suspend`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function getPolicyBindings(): Promise<PolicyBindingListResponse> {
  return await requestJson('/v1/policy-bindings', {
    method: 'GET',
  });
}

export async function postCreatePolicyBinding(body: PolicyBindingCreateRequest): Promise<PolicyBindingResponse> {
  return await requestJson('/v1/policy-bindings', {
    method: 'POST',
    bodyJson: body,
  });
}

export async function getSecretRefs(): Promise<SecretRefListResponse> {
  return await requestJson('/v1/secret-refs', {
    method: 'GET',
  });
}

export async function postCreateSecretRef(body: SecretRefCreateRequest): Promise<SecretRefResponse> {
  return await requestJson('/v1/secret-refs', {
    method: 'POST',
    bodyJson: body,
  });
}

export async function getScopeGrants(): Promise<ScopeGrantListResponse> {
  return await requestJson('/v1/scope-grants', {
    method: 'GET',
  });
}

export async function getGovernanceRequests(): Promise<GovernanceChangeRequestListResponse> {
  return await requestJson('/v1/governance-change-requests', {
    method: 'GET',
  });
}

export async function getGovernanceRequest(requestId: string): Promise<GovernanceChangeRequestDetailResponse> {
  return await requestJson(`/v1/governance-change-requests/${encodeURIComponent(requestId)}`, {
    method: 'GET',
  });
}

export async function postCreateGovernanceRequest(
  body: GovernanceChangeRequestCreateRequest,
): Promise<GovernanceChangeRequestResponse> {
  return await requestJson('/v1/governance-change-requests', {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postApproveGovernanceRequest(
  requestId: string,
  body: GovernanceChangeDecisionRequest,
): Promise<GovernanceChangeDecisionResponse> {
  return await requestJson(`/v1/governance-change-requests/${encodeURIComponent(requestId)}/approve`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postRejectGovernanceRequest(
  requestId: string,
  body: GovernanceChangeDecisionRequest,
): Promise<GovernanceChangeDecisionResponse> {
  return await requestJson(`/v1/governance-change-requests/${encodeURIComponent(requestId)}/reject`, {
    method: 'POST',
    bodyJson: body,
  });
}
