import { Pool, type PoolClient } from 'pg';

import type {
  ActionBindingRecord,
  AgentDefinitionRecord,
  BridgeRegistrationRecord,
  ConnectorBindingRecord,
  ConnectorDefinitionRecord,
  DueScheduleTrigger,
  EventSubscriptionRecord,
  GovernanceChangeDecisionRecord,
  GovernanceChangeRequestRecord,
  PolicyBindingRecord,
  ScopeGrantRecord,
  SecretRefRecord,
  TriggerBindingRecord,
  TriggerDispatchRecord,
} from '@baseinterface/workflow-contracts';

function toMs(value: unknown): number {
  return new Date(String(value)).getTime();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function toAgentDefinitionRecord(row: Record<string, unknown>): AgentDefinitionRecord {
  return {
    agentId: String(row.agent_id),
    workspaceId: String(row.workspace_id),
    templateVersionRef: String(row.template_version_ref),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    activationState: String(row.activation_state) as AgentDefinitionRecord['activationState'],
    bridgeId: row.bridge_id ? String(row.bridge_id) : undefined,
    identityRef: row.identity_ref ? String(row.identity_ref) : undefined,
    executorStrategy: String(row.executor_strategy) as AgentDefinitionRecord['executorStrategy'],
    toolProfile: row.tool_profile ? String(row.tool_profile) : undefined,
    riskLevel: row.risk_level ? String(row.risk_level) as AgentDefinitionRecord['riskLevel'] : undefined,
    ownerActorRef: row.owner_actor_ref ? String(row.owner_actor_ref) : undefined,
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toBridgeRegistrationRecord(row: Record<string, unknown>): BridgeRegistrationRecord {
  return {
    bridgeId: String(row.bridge_id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    baseUrl: String(row.base_url),
    serviceId: String(row.service_id),
    status: String(row.status) as BridgeRegistrationRecord['status'],
    runtimeType: String(row.runtime_type) as BridgeRegistrationRecord['runtimeType'],
    manifestJson: parseJson(row.manifest_json, {}),
    healthJson: parseJson(row.health_json, undefined),
    authConfigJson: parseJson(row.auth_config_json, {}),
    callbackConfigJson: parseJson(row.callback_config_json, {}),
    lastHealthAt: row.last_health_at ? toMs(row.last_health_at) : undefined,
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  } as BridgeRegistrationRecord;
}

function toTriggerBindingRecord(row: Record<string, unknown>): TriggerBindingRecord {
  return {
    triggerBindingId: String(row.trigger_binding_id),
    workspaceId: String(row.workspace_id),
    agentId: String(row.agent_id),
    triggerKind: String(row.trigger_kind) as TriggerBindingRecord['triggerKind'],
    status: String(row.status) as TriggerBindingRecord['status'],
    configJson: parseJson(row.config_json, {}),
    publicTriggerKey: row.public_trigger_key ? String(row.public_trigger_key) : undefined,
    lastTriggeredAt: row.last_triggered_at ? toMs(row.last_triggered_at) : undefined,
    nextTriggerAt: row.next_trigger_at ? toMs(row.next_trigger_at) : undefined,
    lastError: row.last_error ? String(row.last_error) : undefined,
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toConnectorDefinitionRecord(row: Record<string, unknown>): ConnectorDefinitionRecord {
  return {
    connectorDefinitionId: String(row.connector_definition_id),
    workspaceId: String(row.workspace_id),
    connectorKey: String(row.connector_key),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    status: String(row.status) as ConnectorDefinitionRecord['status'],
    catalogJson: parseJson(row.catalog_json, { actions: [], events: [] }),
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toConnectorBindingRecord(row: Record<string, unknown>): ConnectorBindingRecord {
  return {
    connectorBindingId: String(row.connector_binding_id),
    workspaceId: String(row.workspace_id),
    connectorDefinitionId: String(row.connector_definition_id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    status: String(row.status) as ConnectorBindingRecord['status'],
    secretRefId: row.secret_ref_id ? String(row.secret_ref_id) : undefined,
    metadataJson: parseJson(row.metadata_json, undefined),
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toActionBindingRecord(row: Record<string, unknown>): ActionBindingRecord {
  return {
    actionBindingId: String(row.action_binding_id),
    workspaceId: String(row.workspace_id),
    agentId: String(row.agent_id),
    actionRef: String(row.action_ref),
    connectorBindingId: String(row.connector_binding_id),
    capabilityId: String(row.capability_id),
    status: String(row.status) as ActionBindingRecord['status'],
    sideEffectClass: String(row.side_effect_class) as ActionBindingRecord['sideEffectClass'],
    executionMode: String(row.execution_mode) as ActionBindingRecord['executionMode'],
    timeoutMs: row.timeout_ms === null || row.timeout_ms === undefined ? undefined : Number(row.timeout_ms),
    browserFallbackMode: String(row.browser_fallback_mode) as ActionBindingRecord['browserFallbackMode'],
    configJson: parseJson(row.config_json, {}),
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toEventSubscriptionRecord(row: Record<string, unknown>): EventSubscriptionRecord {
  return {
    eventSubscriptionId: String(row.event_subscription_id),
    workspaceId: String(row.workspace_id),
    connectorBindingId: String(row.connector_binding_id),
    triggerBindingId: String(row.trigger_binding_id),
    eventType: String(row.event_type),
    status: String(row.status) as EventSubscriptionRecord['status'],
    publicSubscriptionKey: row.public_subscription_key ? String(row.public_subscription_key) : undefined,
    configJson: parseJson(row.config_json, {}),
    lastEventAt: row.last_event_at ? toMs(row.last_event_at) : undefined,
    lastError: row.last_error ? String(row.last_error) : undefined,
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toPolicyBindingRecord(row: Record<string, unknown>): PolicyBindingRecord {
  return {
    policyBindingId: String(row.policy_binding_id),
    workspaceId: String(row.workspace_id),
    policyKind: String(row.policy_kind) as PolicyBindingRecord['policyKind'],
    targetType: String(row.target_type) as PolicyBindingRecord['targetType'],
    targetRef: String(row.target_ref),
    status: String(row.status) as PolicyBindingRecord['status'],
    configJson: parseJson(row.config_json, {}),
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toSecretRefRecord(row: Record<string, unknown>): SecretRefRecord {
  return {
    secretRefId: String(row.secret_ref_id),
    workspaceId: String(row.workspace_id),
    environmentScope: String(row.environment_scope),
    providerType: String(row.provider_type),
    status: String(row.status) as SecretRefRecord['status'],
    metadataJson: parseJson(row.metadata_json, {}),
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toScopeGrantRecord(row: Record<string, unknown>): ScopeGrantRecord {
  return {
    scopeGrantId: String(row.scope_grant_id),
    workspaceId: String(row.workspace_id),
    targetType: String(row.target_type) as ScopeGrantRecord['targetType'],
    targetRef: String(row.target_ref),
    resourceType: String(row.resource_type),
    resourceRef: String(row.resource_ref),
    status: String(row.status) as ScopeGrantRecord['status'],
    scopeJson: parseJson(row.scope_json, {}),
    expiresAt: row.expires_at ? toMs(row.expires_at) : undefined,
    createdBy: String(row.created_by),
    updatedBy: String(row.updated_by),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toGovernanceChangeRequestRecord(row: Record<string, unknown>): GovernanceChangeRequestRecord {
  return {
    requestId: String(row.request_id),
    workspaceId: String(row.workspace_id),
    requestKind: String(row.request_kind) as GovernanceChangeRequestRecord['requestKind'],
    targetType: String(row.target_type) as GovernanceChangeRequestRecord['targetType'],
    targetRef: String(row.target_ref),
    requestedByActorId: String(row.requested_by_actor_id),
    status: String(row.status) as GovernanceChangeRequestRecord['status'],
    riskLevel: String(row.risk_level) as GovernanceChangeRequestRecord['riskLevel'],
    summary: String(row.summary),
    justification: row.justification ? String(row.justification) : undefined,
    desiredStateJson: parseJson(row.desired_state_json, {}),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toGovernanceChangeDecisionRecord(row: Record<string, unknown>): GovernanceChangeDecisionRecord {
  return {
    decisionId: String(row.decision_id),
    requestId: String(row.request_id),
    actorRef: String(row.actor_ref),
    decision: String(row.decision) as GovernanceChangeDecisionRecord['decision'],
    comment: row.comment ? String(row.comment) : undefined,
    decidedAt: toMs(row.decided_at),
  };
}

function toTriggerDispatchRecord(row: Record<string, unknown>): TriggerDispatchRecord {
  return {
    triggerDispatchId: String(row.trigger_dispatch_id),
    triggerBindingId: String(row.trigger_binding_id),
    dispatchKey: String(row.dispatch_key),
    sourceType: String(row.source_type) as TriggerDispatchRecord['sourceType'],
    status: String(row.status) as TriggerDispatchRecord['status'],
    runId: row.run_id ? String(row.run_id) : undefined,
    payloadJson: parseJson(row.payload_json, undefined),
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

export type GovernanceRepository = {
  close: () => Promise<void>;
  runInTransaction: <T>(callback: (repository: GovernanceRepository) => Promise<T>) => Promise<T>;
  lockAgent: (agentId: string) => Promise<void>;
  lockBridgeRegistration: (bridgeId: string) => Promise<void>;
  lockTriggerBinding: (triggerBindingId: string) => Promise<void>;
  lockConnectorBinding: (connectorBindingId: string) => Promise<void>;
  lockActionBinding: (actionBindingId: string) => Promise<void>;
  lockEventSubscription: (eventSubscriptionId: string) => Promise<void>;
  listAgents: () => Promise<AgentDefinitionRecord[]>;
  getAgent: (agentId: string) => Promise<AgentDefinitionRecord | undefined>;
  createAgent: (record: AgentDefinitionRecord) => Promise<AgentDefinitionRecord>;
  updateAgent: (record: AgentDefinitionRecord) => Promise<AgentDefinitionRecord>;
  listBridgeRegistrations: () => Promise<BridgeRegistrationRecord[]>;
  getBridgeRegistration: (bridgeId: string) => Promise<BridgeRegistrationRecord | undefined>;
  createBridgeRegistration: (record: BridgeRegistrationRecord) => Promise<BridgeRegistrationRecord>;
  updateBridgeRegistration: (record: BridgeRegistrationRecord) => Promise<BridgeRegistrationRecord>;
  listTriggerBindingsByAgent: (agentId: string) => Promise<TriggerBindingRecord[]>;
  getTriggerBinding: (triggerBindingId: string) => Promise<TriggerBindingRecord | undefined>;
  getTriggerBindingByPublicKey: (publicTriggerKey: string) => Promise<TriggerBindingRecord | undefined>;
  createTriggerBinding: (record: TriggerBindingRecord) => Promise<TriggerBindingRecord>;
  updateTriggerBinding: (record: TriggerBindingRecord) => Promise<TriggerBindingRecord>;
  listConnectorDefinitions: () => Promise<ConnectorDefinitionRecord[]>;
  getConnectorDefinition: (connectorDefinitionId: string) => Promise<ConnectorDefinitionRecord | undefined>;
  getConnectorDefinitionByKey: (workspaceId: string, connectorKey: string) => Promise<ConnectorDefinitionRecord | undefined>;
  createConnectorDefinition: (record: ConnectorDefinitionRecord) => Promise<ConnectorDefinitionRecord>;
  updateConnectorDefinition: (record: ConnectorDefinitionRecord) => Promise<ConnectorDefinitionRecord>;
  listConnectorBindings: () => Promise<ConnectorBindingRecord[]>;
  getConnectorBinding: (connectorBindingId: string) => Promise<ConnectorBindingRecord | undefined>;
  createConnectorBinding: (record: ConnectorBindingRecord) => Promise<ConnectorBindingRecord>;
  updateConnectorBinding: (record: ConnectorBindingRecord) => Promise<ConnectorBindingRecord>;
  listActionBindingsByAgent: (agentId: string) => Promise<ActionBindingRecord[]>;
  getActionBinding: (actionBindingId: string) => Promise<ActionBindingRecord | undefined>;
  createActionBinding: (record: ActionBindingRecord) => Promise<ActionBindingRecord>;
  updateActionBinding: (record: ActionBindingRecord) => Promise<ActionBindingRecord>;
  listEventSubscriptions: () => Promise<EventSubscriptionRecord[]>;
  listEventSubscriptionsByTriggerBinding: (triggerBindingId: string) => Promise<EventSubscriptionRecord[]>;
  getEventSubscription: (eventSubscriptionId: string) => Promise<EventSubscriptionRecord | undefined>;
  getEventSubscriptionByPublicKey: (publicSubscriptionKey: string) => Promise<EventSubscriptionRecord | undefined>;
  createEventSubscription: (record: EventSubscriptionRecord) => Promise<EventSubscriptionRecord>;
  updateEventSubscription: (record: EventSubscriptionRecord) => Promise<EventSubscriptionRecord>;
  listDueScheduleTriggers: (timestamp: number) => Promise<DueScheduleTrigger[]>;
  listPolicyBindings: () => Promise<PolicyBindingRecord[]>;
  listPolicyBindingsForTarget: (targetType: string, targetRef: string) => Promise<PolicyBindingRecord[]>;
  getPolicyBinding: (policyBindingId: string) => Promise<PolicyBindingRecord | undefined>;
  createPolicyBinding: (record: PolicyBindingRecord) => Promise<PolicyBindingRecord>;
  updatePolicyBinding: (record: PolicyBindingRecord) => Promise<PolicyBindingRecord>;
  listSecretRefs: () => Promise<SecretRefRecord[]>;
  getSecretRef: (secretRefId: string) => Promise<SecretRefRecord | undefined>;
  createSecretRef: (record: SecretRefRecord) => Promise<SecretRefRecord>;
  listScopeGrants: () => Promise<ScopeGrantRecord[]>;
  listScopeGrantsForTarget: (targetType: string, targetRef: string) => Promise<ScopeGrantRecord[]>;
  getScopeGrant: (scopeGrantId: string) => Promise<ScopeGrantRecord | undefined>;
  createScopeGrant: (record: ScopeGrantRecord) => Promise<ScopeGrantRecord>;
  updateScopeGrant: (record: ScopeGrantRecord) => Promise<ScopeGrantRecord>;
  listGovernanceChangeRequests: () => Promise<GovernanceChangeRequestRecord[]>;
  getGovernanceChangeRequest: (requestId: string) => Promise<GovernanceChangeRequestRecord | undefined>;
  createGovernanceChangeRequest: (record: GovernanceChangeRequestRecord) => Promise<GovernanceChangeRequestRecord>;
  updateGovernanceChangeRequest: (record: GovernanceChangeRequestRecord) => Promise<GovernanceChangeRequestRecord>;
  listGovernanceChangeDecisions: (requestId: string) => Promise<GovernanceChangeDecisionRecord[]>;
  createGovernanceChangeDecision: (record: GovernanceChangeDecisionRecord) => Promise<GovernanceChangeDecisionRecord>;
  getTriggerDispatchByKey: (dispatchKey: string) => Promise<TriggerDispatchRecord | undefined>;
  createTriggerDispatch: (record: TriggerDispatchRecord) => Promise<TriggerDispatchRecord>;
  updateTriggerDispatch: (record: TriggerDispatchRecord) => Promise<TriggerDispatchRecord>;
};

export class MemoryGovernanceRepository implements GovernanceRepository {
  private readonly agents = new Map<string, AgentDefinitionRecord>();
  private readonly bridges = new Map<string, BridgeRegistrationRecord>();
  private readonly triggerBindings = new Map<string, TriggerBindingRecord>();
  private readonly connectorDefinitions = new Map<string, ConnectorDefinitionRecord>();
  private readonly connectorBindings = new Map<string, ConnectorBindingRecord>();
  private readonly actionBindings = new Map<string, ActionBindingRecord>();
  private readonly eventSubscriptions = new Map<string, EventSubscriptionRecord>();
  private readonly policyBindings = new Map<string, PolicyBindingRecord>();
  private readonly secretRefs = new Map<string, SecretRefRecord>();
  private readonly scopeGrants = new Map<string, ScopeGrantRecord>();
  private readonly requests = new Map<string, GovernanceChangeRequestRecord>();
  private readonly decisionsByRequest = new Map<string, GovernanceChangeDecisionRecord[]>();
  private readonly dispatchesByKey = new Map<string, TriggerDispatchRecord>();

  async close(): Promise<void> {
    return;
  }

  async runInTransaction<T>(callback: (repository: GovernanceRepository) => Promise<T>): Promise<T> {
    return await callback(this);
  }

  async lockAgent(_agentId: string): Promise<void> {
    return;
  }

  async lockBridgeRegistration(_bridgeId: string): Promise<void> {
    return;
  }

  async lockTriggerBinding(_triggerBindingId: string): Promise<void> {
    return;
  }

  async lockConnectorBinding(_connectorBindingId: string): Promise<void> {
    return;
  }

  async lockActionBinding(_actionBindingId: string): Promise<void> {
    return;
  }

  async lockEventSubscription(_eventSubscriptionId: string): Promise<void> {
    return;
  }

  async listAgents(): Promise<AgentDefinitionRecord[]> {
    return [...this.agents.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getAgent(agentId: string): Promise<AgentDefinitionRecord | undefined> {
    return this.agents.get(agentId);
  }

  async createAgent(record: AgentDefinitionRecord): Promise<AgentDefinitionRecord> {
    this.agents.set(record.agentId, record);
    return record;
  }

  async updateAgent(record: AgentDefinitionRecord): Promise<AgentDefinitionRecord> {
    this.agents.set(record.agentId, record);
    return record;
  }

  async listBridgeRegistrations(): Promise<BridgeRegistrationRecord[]> {
    return [...this.bridges.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getBridgeRegistration(bridgeId: string): Promise<BridgeRegistrationRecord | undefined> {
    return this.bridges.get(bridgeId);
  }

  async createBridgeRegistration(record: BridgeRegistrationRecord): Promise<BridgeRegistrationRecord> {
    this.bridges.set(record.bridgeId, record);
    return record;
  }

  async updateBridgeRegistration(record: BridgeRegistrationRecord): Promise<BridgeRegistrationRecord> {
    this.bridges.set(record.bridgeId, record);
    return record;
  }

  async listTriggerBindingsByAgent(agentId: string): Promise<TriggerBindingRecord[]> {
    return [...this.triggerBindings.values()]
      .filter((item) => item.agentId === agentId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getTriggerBinding(triggerBindingId: string): Promise<TriggerBindingRecord | undefined> {
    return this.triggerBindings.get(triggerBindingId);
  }

  async getTriggerBindingByPublicKey(publicTriggerKey: string): Promise<TriggerBindingRecord | undefined> {
    return [...this.triggerBindings.values()].find((item) => item.publicTriggerKey === publicTriggerKey);
  }

  async createTriggerBinding(record: TriggerBindingRecord): Promise<TriggerBindingRecord> {
    this.triggerBindings.set(record.triggerBindingId, record);
    return record;
  }

  async updateTriggerBinding(record: TriggerBindingRecord): Promise<TriggerBindingRecord> {
    this.triggerBindings.set(record.triggerBindingId, record);
    return record;
  }

  async listConnectorDefinitions(): Promise<ConnectorDefinitionRecord[]> {
    return [...this.connectorDefinitions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getConnectorDefinition(connectorDefinitionId: string): Promise<ConnectorDefinitionRecord | undefined> {
    return this.connectorDefinitions.get(connectorDefinitionId);
  }

  async getConnectorDefinitionByKey(
    workspaceId: string,
    connectorKey: string,
  ): Promise<ConnectorDefinitionRecord | undefined> {
    return [...this.connectorDefinitions.values()].find((item) => item.workspaceId === workspaceId && item.connectorKey === connectorKey);
  }

  async createConnectorDefinition(record: ConnectorDefinitionRecord): Promise<ConnectorDefinitionRecord> {
    this.connectorDefinitions.set(record.connectorDefinitionId, record);
    return record;
  }

  async updateConnectorDefinition(record: ConnectorDefinitionRecord): Promise<ConnectorDefinitionRecord> {
    this.connectorDefinitions.set(record.connectorDefinitionId, record);
    return record;
  }

  async listConnectorBindings(): Promise<ConnectorBindingRecord[]> {
    return [...this.connectorBindings.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getConnectorBinding(connectorBindingId: string): Promise<ConnectorBindingRecord | undefined> {
    return this.connectorBindings.get(connectorBindingId);
  }

  async createConnectorBinding(record: ConnectorBindingRecord): Promise<ConnectorBindingRecord> {
    this.connectorBindings.set(record.connectorBindingId, record);
    return record;
  }

  async updateConnectorBinding(record: ConnectorBindingRecord): Promise<ConnectorBindingRecord> {
    this.connectorBindings.set(record.connectorBindingId, record);
    return record;
  }

  async listActionBindingsByAgent(agentId: string): Promise<ActionBindingRecord[]> {
    return [...this.actionBindings.values()]
      .filter((item) => item.agentId === agentId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getActionBinding(actionBindingId: string): Promise<ActionBindingRecord | undefined> {
    return this.actionBindings.get(actionBindingId);
  }

  async createActionBinding(record: ActionBindingRecord): Promise<ActionBindingRecord> {
    this.actionBindings.set(record.actionBindingId, record);
    return record;
  }

  async updateActionBinding(record: ActionBindingRecord): Promise<ActionBindingRecord> {
    this.actionBindings.set(record.actionBindingId, record);
    return record;
  }

  async listEventSubscriptions(): Promise<EventSubscriptionRecord[]> {
    return [...this.eventSubscriptions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async listEventSubscriptionsByTriggerBinding(triggerBindingId: string): Promise<EventSubscriptionRecord[]> {
    return [...this.eventSubscriptions.values()].filter((item) => item.triggerBindingId === triggerBindingId);
  }

  async getEventSubscription(eventSubscriptionId: string): Promise<EventSubscriptionRecord | undefined> {
    return this.eventSubscriptions.get(eventSubscriptionId);
  }

  async getEventSubscriptionByPublicKey(publicSubscriptionKey: string): Promise<EventSubscriptionRecord | undefined> {
    return [...this.eventSubscriptions.values()].find((item) => item.publicSubscriptionKey === publicSubscriptionKey);
  }

  async createEventSubscription(record: EventSubscriptionRecord): Promise<EventSubscriptionRecord> {
    this.eventSubscriptions.set(record.eventSubscriptionId, record);
    return record;
  }

  async updateEventSubscription(record: EventSubscriptionRecord): Promise<EventSubscriptionRecord> {
    this.eventSubscriptions.set(record.eventSubscriptionId, record);
    return record;
  }

  async listDueScheduleTriggers(timestamp: number): Promise<DueScheduleTrigger[]> {
    return [...this.triggerBindings.values()]
      .filter((item) => item.triggerKind === 'schedule' && item.status === 'enabled' && typeof item.nextTriggerAt === 'number' && item.nextTriggerAt <= timestamp)
      .map((item) => ({
        triggerBindingId: item.triggerBindingId,
        agentId: item.agentId,
        workspaceId: item.workspaceId,
        nextTriggerAt: item.nextTriggerAt as number,
        configJson: item.configJson,
      }))
      .sort((a, b) => a.nextTriggerAt - b.nextTriggerAt);
  }

  async listPolicyBindings(): Promise<PolicyBindingRecord[]> {
    return [...this.policyBindings.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async listPolicyBindingsForTarget(targetType: string, targetRef: string): Promise<PolicyBindingRecord[]> {
    return [...this.policyBindings.values()].filter((item) => item.targetType === targetType && item.targetRef === targetRef);
  }

  async getPolicyBinding(policyBindingId: string): Promise<PolicyBindingRecord | undefined> {
    return this.policyBindings.get(policyBindingId);
  }

  async createPolicyBinding(record: PolicyBindingRecord): Promise<PolicyBindingRecord> {
    this.policyBindings.set(record.policyBindingId, record);
    return record;
  }

  async updatePolicyBinding(record: PolicyBindingRecord): Promise<PolicyBindingRecord> {
    this.policyBindings.set(record.policyBindingId, record);
    return record;
  }

  async listSecretRefs(): Promise<SecretRefRecord[]> {
    return [...this.secretRefs.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getSecretRef(secretRefId: string): Promise<SecretRefRecord | undefined> {
    return this.secretRefs.get(secretRefId);
  }

  async createSecretRef(record: SecretRefRecord): Promise<SecretRefRecord> {
    this.secretRefs.set(record.secretRefId, record);
    return record;
  }

  async listScopeGrants(): Promise<ScopeGrantRecord[]> {
    return [...this.scopeGrants.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async listScopeGrantsForTarget(targetType: string, targetRef: string): Promise<ScopeGrantRecord[]> {
    return [...this.scopeGrants.values()].filter((item) => item.targetType === targetType && item.targetRef === targetRef);
  }

  async getScopeGrant(scopeGrantId: string): Promise<ScopeGrantRecord | undefined> {
    return this.scopeGrants.get(scopeGrantId);
  }

  async createScopeGrant(record: ScopeGrantRecord): Promise<ScopeGrantRecord> {
    this.scopeGrants.set(record.scopeGrantId, record);
    return record;
  }

  async updateScopeGrant(record: ScopeGrantRecord): Promise<ScopeGrantRecord> {
    this.scopeGrants.set(record.scopeGrantId, record);
    return record;
  }

  async listGovernanceChangeRequests(): Promise<GovernanceChangeRequestRecord[]> {
    return [...this.requests.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getGovernanceChangeRequest(requestId: string): Promise<GovernanceChangeRequestRecord | undefined> {
    return this.requests.get(requestId);
  }

  async createGovernanceChangeRequest(record: GovernanceChangeRequestRecord): Promise<GovernanceChangeRequestRecord> {
    this.requests.set(record.requestId, record);
    return record;
  }

  async updateGovernanceChangeRequest(record: GovernanceChangeRequestRecord): Promise<GovernanceChangeRequestRecord> {
    this.requests.set(record.requestId, record);
    return record;
  }

  async listGovernanceChangeDecisions(requestId: string): Promise<GovernanceChangeDecisionRecord[]> {
    return [...(this.decisionsByRequest.get(requestId) || [])].sort((a, b) => a.decidedAt - b.decidedAt);
  }

  async createGovernanceChangeDecision(record: GovernanceChangeDecisionRecord): Promise<GovernanceChangeDecisionRecord> {
    const existing = this.decisionsByRequest.get(record.requestId) || [];
    this.decisionsByRequest.set(record.requestId, [...existing, record]);
    return record;
  }

  async getTriggerDispatchByKey(dispatchKey: string): Promise<TriggerDispatchRecord | undefined> {
    return this.dispatchesByKey.get(dispatchKey);
  }

  async createTriggerDispatch(record: TriggerDispatchRecord): Promise<TriggerDispatchRecord> {
    this.dispatchesByKey.set(record.dispatchKey, record);
    return record;
  }

  async updateTriggerDispatch(record: TriggerDispatchRecord): Promise<TriggerDispatchRecord> {
    this.dispatchesByKey.set(record.dispatchKey, record);
    return record;
  }
}

export class PostgresGovernanceRepository implements GovernanceRepository {
  private readonly pool: Pool;
  private readonly client: PoolClient | null;

  constructor(databaseUrlOrPool: string | Pool, client?: PoolClient) {
    this.pool = typeof databaseUrlOrPool === 'string'
      ? new Pool({ connectionString: databaseUrlOrPool })
      : databaseUrlOrPool;
    this.client = client || null;
  }

  private get queryable(): Pick<PoolClient, 'query'> {
    return this.client || this.pool;
  }

  async close(): Promise<void> {
    if (!this.client) {
      await this.pool.end();
    }
  }

  async runInTransaction<T>(callback: (repository: GovernanceRepository) => Promise<T>): Promise<T> {
    if (this.client) {
      return await callback(this);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txRepository = new PostgresGovernanceRepository(this.pool, client);
      const result = await callback(txRepository);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async lockAgent(agentId: string): Promise<void> {
    await this.queryable.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`agent:${agentId}`]);
  }

  async lockBridgeRegistration(bridgeId: string): Promise<void> {
    await this.queryable.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`bridge:${bridgeId}`]);
  }

  async lockTriggerBinding(triggerBindingId: string): Promise<void> {
    await this.queryable.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`trigger:${triggerBindingId}`]);
  }

  async lockConnectorBinding(connectorBindingId: string): Promise<void> {
    await this.queryable.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`connector-binding:${connectorBindingId}`]);
  }

  async lockActionBinding(actionBindingId: string): Promise<void> {
    await this.queryable.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`action-binding:${actionBindingId}`]);
  }

  async lockEventSubscription(eventSubscriptionId: string): Promise<void> {
    await this.queryable.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`event-subscription:${eventSubscriptionId}`]);
  }

  async listAgents(): Promise<AgentDefinitionRecord[]> {
    const result = await this.queryable.query('SELECT * FROM agent_definitions ORDER BY updated_at DESC');
    return result.rows.map((row) => toAgentDefinitionRecord(row));
  }

  async getAgent(agentId: string): Promise<AgentDefinitionRecord | undefined> {
    const result = await this.queryable.query('SELECT * FROM agent_definitions WHERE agent_id = $1', [agentId]);
    return result.rows[0] ? toAgentDefinitionRecord(result.rows[0]) : undefined;
  }

  async createAgent(record: AgentDefinitionRecord): Promise<AgentDefinitionRecord> {
    const result = await this.queryable.query(`
      INSERT INTO agent_definitions (
        agent_id, workspace_id, template_version_ref, name, description, activation_state,
        bridge_id, identity_ref, executor_strategy, tool_profile, risk_level,
        owner_actor_ref, created_by, updated_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, to_timestamp($15 / 1000.0), to_timestamp($16 / 1000.0)
      )
      RETURNING *
    `, [
      record.agentId,
      record.workspaceId,
      record.templateVersionRef,
      record.name,
      record.description || null,
      record.activationState,
      record.bridgeId || null,
      record.identityRef || null,
      record.executorStrategy,
      record.toolProfile || null,
      record.riskLevel || null,
      record.ownerActorRef || null,
      record.createdBy,
      record.updatedBy,
      record.createdAt,
      record.updatedAt,
    ]);
    return toAgentDefinitionRecord(result.rows[0]);
  }

  async updateAgent(record: AgentDefinitionRecord): Promise<AgentDefinitionRecord> {
    const result = await this.queryable.query(`
      UPDATE agent_definitions
      SET workspace_id = $2,
          template_version_ref = $3,
          name = $4,
          description = $5,
          activation_state = $6,
          bridge_id = $7,
          identity_ref = $8,
          executor_strategy = $9,
          tool_profile = $10,
          risk_level = $11,
          owner_actor_ref = $12,
          updated_by = $13,
          updated_at = to_timestamp($14 / 1000.0)
      WHERE agent_id = $1
      RETURNING *
    `, [
      record.agentId,
      record.workspaceId,
      record.templateVersionRef,
      record.name,
      record.description || null,
      record.activationState,
      record.bridgeId || null,
      record.identityRef || null,
      record.executorStrategy,
      record.toolProfile || null,
      record.riskLevel || null,
      record.ownerActorRef || null,
      record.updatedBy,
      record.updatedAt,
    ]);
    return toAgentDefinitionRecord(result.rows[0]);
  }

  async listBridgeRegistrations(): Promise<BridgeRegistrationRecord[]> {
    const result = await this.queryable.query('SELECT * FROM bridge_registrations ORDER BY updated_at DESC');
    return result.rows.map((row) => toBridgeRegistrationRecord(row));
  }

  async getBridgeRegistration(bridgeId: string): Promise<BridgeRegistrationRecord | undefined> {
    const result = await this.queryable.query('SELECT * FROM bridge_registrations WHERE bridge_id = $1', [bridgeId]);
    return result.rows[0] ? toBridgeRegistrationRecord(result.rows[0]) : undefined;
  }

  async createBridgeRegistration(record: BridgeRegistrationRecord): Promise<BridgeRegistrationRecord> {
    const result = await this.queryable.query(`
      INSERT INTO bridge_registrations (
        bridge_id, workspace_id, name, description, base_url, service_id,
        status, runtime_type, manifest_json, health_json, auth_config_json,
        callback_config_json, last_health_at, created_by, updated_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9::jsonb, $10::jsonb, $11::jsonb,
        $12::jsonb, to_timestamp($13 / 1000.0), $14, $15, to_timestamp($16 / 1000.0), to_timestamp($17 / 1000.0)
      )
      RETURNING *
    `, [
      record.bridgeId,
      record.workspaceId,
      record.name,
      record.description || null,
      record.baseUrl,
      record.serviceId,
      record.status,
      record.runtimeType,
      JSON.stringify(record.manifestJson),
      record.healthJson ? JSON.stringify(record.healthJson) : null,
      JSON.stringify(record.authConfigJson),
      JSON.stringify(record.callbackConfigJson),
      record.lastHealthAt || null,
      record.createdBy,
      record.updatedBy,
      record.createdAt,
      record.updatedAt,
    ]);
    return toBridgeRegistrationRecord(result.rows[0]);
  }

  async updateBridgeRegistration(record: BridgeRegistrationRecord): Promise<BridgeRegistrationRecord> {
    const result = await this.queryable.query(`
      UPDATE bridge_registrations
      SET workspace_id = $2,
          name = $3,
          description = $4,
          base_url = $5,
          service_id = $6,
          status = $7,
          runtime_type = $8,
          manifest_json = $9::jsonb,
          health_json = $10::jsonb,
          auth_config_json = $11::jsonb,
          callback_config_json = $12::jsonb,
          last_health_at = to_timestamp($13 / 1000.0),
          updated_by = $14,
          updated_at = to_timestamp($15 / 1000.0)
      WHERE bridge_id = $1
      RETURNING *
    `, [
      record.bridgeId,
      record.workspaceId,
      record.name,
      record.description || null,
      record.baseUrl,
      record.serviceId,
      record.status,
      record.runtimeType,
      JSON.stringify(record.manifestJson),
      record.healthJson ? JSON.stringify(record.healthJson) : null,
      JSON.stringify(record.authConfigJson),
      JSON.stringify(record.callbackConfigJson),
      record.lastHealthAt || null,
      record.updatedBy,
      record.updatedAt,
    ]);
    return toBridgeRegistrationRecord(result.rows[0]);
  }

  async listTriggerBindingsByAgent(agentId: string): Promise<TriggerBindingRecord[]> {
    const result = await this.queryable.query(`
      SELECT * FROM trigger_bindings
      WHERE agent_id = $1
      ORDER BY updated_at DESC
    `, [agentId]);
    return result.rows.map((row) => toTriggerBindingRecord(row));
  }

  async getTriggerBinding(triggerBindingId: string): Promise<TriggerBindingRecord | undefined> {
    const result = await this.queryable.query('SELECT * FROM trigger_bindings WHERE trigger_binding_id = $1', [triggerBindingId]);
    return result.rows[0] ? toTriggerBindingRecord(result.rows[0]) : undefined;
  }

  async getTriggerBindingByPublicKey(publicTriggerKey: string): Promise<TriggerBindingRecord | undefined> {
    const result = await this.queryable.query('SELECT * FROM trigger_bindings WHERE public_trigger_key = $1', [publicTriggerKey]);
    return result.rows[0] ? toTriggerBindingRecord(result.rows[0]) : undefined;
  }

  async createTriggerBinding(record: TriggerBindingRecord): Promise<TriggerBindingRecord> {
    const result = await this.queryable.query(`
      INSERT INTO trigger_bindings (
        trigger_binding_id, workspace_id, agent_id, trigger_kind, status, config_json,
        public_trigger_key, last_triggered_at, next_trigger_at, last_error,
        created_by, updated_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6::jsonb,
        $7, to_timestamp($8 / 1000.0), to_timestamp($9 / 1000.0), $10,
        $11, $12, to_timestamp($13 / 1000.0), to_timestamp($14 / 1000.0)
      )
      RETURNING *
    `, [
      record.triggerBindingId,
      record.workspaceId,
      record.agentId,
      record.triggerKind,
      record.status,
      JSON.stringify(record.configJson),
      record.publicTriggerKey || null,
      record.lastTriggeredAt || null,
      record.nextTriggerAt || null,
      record.lastError || null,
      record.createdBy,
      record.updatedBy,
      record.createdAt,
      record.updatedAt,
    ]);
    return toTriggerBindingRecord(result.rows[0]);
  }

  async updateTriggerBinding(record: TriggerBindingRecord): Promise<TriggerBindingRecord> {
    const result = await this.queryable.query(`
      UPDATE trigger_bindings
      SET workspace_id = $2,
          agent_id = $3,
          trigger_kind = $4,
          status = $5,
          config_json = $6::jsonb,
          public_trigger_key = $7,
          last_triggered_at = to_timestamp($8 / 1000.0),
          next_trigger_at = to_timestamp($9 / 1000.0),
          last_error = $10,
          updated_by = $11,
          updated_at = to_timestamp($12 / 1000.0)
      WHERE trigger_binding_id = $1
      RETURNING *
    `, [
      record.triggerBindingId,
      record.workspaceId,
      record.agentId,
      record.triggerKind,
      record.status,
      JSON.stringify(record.configJson),
      record.publicTriggerKey || null,
      record.lastTriggeredAt || null,
      record.nextTriggerAt || null,
      record.lastError || null,
      record.updatedBy,
      record.updatedAt,
    ]);
    return toTriggerBindingRecord(result.rows[0]);
  }

  async listConnectorDefinitions(): Promise<ConnectorDefinitionRecord[]> {
    const result = await this.queryable.query('SELECT * FROM connector_definitions ORDER BY updated_at DESC');
    return result.rows.map((row) => toConnectorDefinitionRecord(row));
  }

  async getConnectorDefinition(connectorDefinitionId: string): Promise<ConnectorDefinitionRecord | undefined> {
    const result = await this.queryable.query('SELECT * FROM connector_definitions WHERE connector_definition_id = $1', [connectorDefinitionId]);
    return result.rows[0] ? toConnectorDefinitionRecord(result.rows[0]) : undefined;
  }

  async getConnectorDefinitionByKey(
    workspaceId: string,
    connectorKey: string,
  ): Promise<ConnectorDefinitionRecord | undefined> {
    const result = await this.queryable.query(
      'SELECT * FROM connector_definitions WHERE workspace_id = $1 AND connector_key = $2 LIMIT 1',
      [workspaceId, connectorKey],
    );
    return result.rows[0] ? toConnectorDefinitionRecord(result.rows[0]) : undefined;
  }

  async createConnectorDefinition(record: ConnectorDefinitionRecord): Promise<ConnectorDefinitionRecord> {
    const result = await this.queryable.query(`
      INSERT INTO connector_definitions (
        connector_definition_id, workspace_id, connector_key, name, description, status,
        catalog_json, created_by, updated_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::jsonb, $8, $9, to_timestamp($10 / 1000.0), to_timestamp($11 / 1000.0)
      )
      RETURNING *
    `, [
      record.connectorDefinitionId,
      record.workspaceId,
      record.connectorKey,
      record.name,
      record.description || null,
      record.status,
      JSON.stringify(record.catalogJson),
      record.createdBy,
      record.updatedBy,
      record.createdAt,
      record.updatedAt,
    ]);
    return toConnectorDefinitionRecord(result.rows[0]);
  }

  async updateConnectorDefinition(record: ConnectorDefinitionRecord): Promise<ConnectorDefinitionRecord> {
    const result = await this.queryable.query(`
      UPDATE connector_definitions
      SET workspace_id = $2,
          connector_key = $3,
          name = $4,
          description = $5,
          status = $6,
          catalog_json = $7::jsonb,
          updated_by = $8,
          updated_at = to_timestamp($9 / 1000.0)
      WHERE connector_definition_id = $1
      RETURNING *
    `, [
      record.connectorDefinitionId,
      record.workspaceId,
      record.connectorKey,
      record.name,
      record.description || null,
      record.status,
      JSON.stringify(record.catalogJson),
      record.updatedBy,
      record.updatedAt,
    ]);
    return toConnectorDefinitionRecord(result.rows[0]);
  }

  async listConnectorBindings(): Promise<ConnectorBindingRecord[]> {
    const result = await this.queryable.query('SELECT * FROM connector_bindings ORDER BY updated_at DESC');
    return result.rows.map((row) => toConnectorBindingRecord(row));
  }

  async getConnectorBinding(connectorBindingId: string): Promise<ConnectorBindingRecord | undefined> {
    const result = await this.queryable.query('SELECT * FROM connector_bindings WHERE connector_binding_id = $1', [connectorBindingId]);
    return result.rows[0] ? toConnectorBindingRecord(result.rows[0]) : undefined;
  }

  async createConnectorBinding(record: ConnectorBindingRecord): Promise<ConnectorBindingRecord> {
    const result = await this.queryable.query(`
      INSERT INTO connector_bindings (
        connector_binding_id, workspace_id, connector_definition_id, name, description,
        status, secret_ref_id, metadata_json, created_by, updated_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8::jsonb, $9, $10, to_timestamp($11 / 1000.0), to_timestamp($12 / 1000.0)
      )
      RETURNING *
    `, [
      record.connectorBindingId,
      record.workspaceId,
      record.connectorDefinitionId,
      record.name,
      record.description || null,
      record.status,
      record.secretRefId || null,
      record.metadataJson ? JSON.stringify(record.metadataJson) : null,
      record.createdBy,
      record.updatedBy,
      record.createdAt,
      record.updatedAt,
    ]);
    return toConnectorBindingRecord(result.rows[0]);
  }

  async updateConnectorBinding(record: ConnectorBindingRecord): Promise<ConnectorBindingRecord> {
    const result = await this.queryable.query(`
      UPDATE connector_bindings
      SET workspace_id = $2,
          connector_definition_id = $3,
          name = $4,
          description = $5,
          status = $6,
          secret_ref_id = $7,
          metadata_json = $8::jsonb,
          updated_by = $9,
          updated_at = to_timestamp($10 / 1000.0)
      WHERE connector_binding_id = $1
      RETURNING *
    `, [
      record.connectorBindingId,
      record.workspaceId,
      record.connectorDefinitionId,
      record.name,
      record.description || null,
      record.status,
      record.secretRefId || null,
      record.metadataJson ? JSON.stringify(record.metadataJson) : null,
      record.updatedBy,
      record.updatedAt,
    ]);
    return toConnectorBindingRecord(result.rows[0]);
  }

  async listActionBindingsByAgent(agentId: string): Promise<ActionBindingRecord[]> {
    const result = await this.queryable.query(
      'SELECT * FROM action_bindings WHERE agent_id = $1 ORDER BY updated_at DESC',
      [agentId],
    );
    return result.rows.map((row) => toActionBindingRecord(row));
  }

  async getActionBinding(actionBindingId: string): Promise<ActionBindingRecord | undefined> {
    const result = await this.queryable.query('SELECT * FROM action_bindings WHERE action_binding_id = $1', [actionBindingId]);
    return result.rows[0] ? toActionBindingRecord(result.rows[0]) : undefined;
  }

  async createActionBinding(record: ActionBindingRecord): Promise<ActionBindingRecord> {
    const result = await this.queryable.query(`
      INSERT INTO action_bindings (
        action_binding_id, workspace_id, agent_id, action_ref, connector_binding_id,
        capability_id, status, side_effect_class, execution_mode, timeout_ms,
        browser_fallback_mode, config_json, created_by, updated_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12::jsonb, $13, $14, to_timestamp($15 / 1000.0), to_timestamp($16 / 1000.0)
      )
      RETURNING *
    `, [
      record.actionBindingId,
      record.workspaceId,
      record.agentId,
      record.actionRef,
      record.connectorBindingId,
      record.capabilityId,
      record.status,
      record.sideEffectClass,
      record.executionMode,
      record.timeoutMs ?? null,
      record.browserFallbackMode,
      JSON.stringify(record.configJson),
      record.createdBy,
      record.updatedBy,
      record.createdAt,
      record.updatedAt,
    ]);
    return toActionBindingRecord(result.rows[0]);
  }

  async updateActionBinding(record: ActionBindingRecord): Promise<ActionBindingRecord> {
    const result = await this.queryable.query(`
      UPDATE action_bindings
      SET workspace_id = $2,
          agent_id = $3,
          action_ref = $4,
          connector_binding_id = $5,
          capability_id = $6,
          status = $7,
          side_effect_class = $8,
          execution_mode = $9,
          timeout_ms = $10,
          browser_fallback_mode = $11,
          config_json = $12::jsonb,
          updated_by = $13,
          updated_at = to_timestamp($14 / 1000.0)
      WHERE action_binding_id = $1
      RETURNING *
    `, [
      record.actionBindingId,
      record.workspaceId,
      record.agentId,
      record.actionRef,
      record.connectorBindingId,
      record.capabilityId,
      record.status,
      record.sideEffectClass,
      record.executionMode,
      record.timeoutMs ?? null,
      record.browserFallbackMode,
      JSON.stringify(record.configJson),
      record.updatedBy,
      record.updatedAt,
    ]);
    return toActionBindingRecord(result.rows[0]);
  }

  async listEventSubscriptions(): Promise<EventSubscriptionRecord[]> {
    const result = await this.queryable.query('SELECT * FROM event_subscriptions ORDER BY updated_at DESC');
    return result.rows.map((row) => toEventSubscriptionRecord(row));
  }

  async listEventSubscriptionsByTriggerBinding(triggerBindingId: string): Promise<EventSubscriptionRecord[]> {
    const result = await this.queryable.query(
      'SELECT * FROM event_subscriptions WHERE trigger_binding_id = $1 ORDER BY updated_at DESC',
      [triggerBindingId],
    );
    return result.rows.map((row) => toEventSubscriptionRecord(row));
  }

  async getEventSubscription(eventSubscriptionId: string): Promise<EventSubscriptionRecord | undefined> {
    const result = await this.queryable.query('SELECT * FROM event_subscriptions WHERE event_subscription_id = $1', [eventSubscriptionId]);
    return result.rows[0] ? toEventSubscriptionRecord(result.rows[0]) : undefined;
  }

  async getEventSubscriptionByPublicKey(publicSubscriptionKey: string): Promise<EventSubscriptionRecord | undefined> {
    const result = await this.queryable.query(
      'SELECT * FROM event_subscriptions WHERE public_subscription_key = $1 LIMIT 1',
      [publicSubscriptionKey],
    );
    return result.rows[0] ? toEventSubscriptionRecord(result.rows[0]) : undefined;
  }

  async createEventSubscription(record: EventSubscriptionRecord): Promise<EventSubscriptionRecord> {
    const result = await this.queryable.query(`
      INSERT INTO event_subscriptions (
        event_subscription_id, workspace_id, connector_binding_id, trigger_binding_id, event_type,
        status, public_subscription_key, config_json, last_event_at, last_error,
        created_by, updated_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8::jsonb, $9, $10,
        $11, $12, to_timestamp($13 / 1000.0), to_timestamp($14 / 1000.0)
      )
      RETURNING *
    `, [
      record.eventSubscriptionId,
      record.workspaceId,
      record.connectorBindingId,
      record.triggerBindingId,
      record.eventType,
      record.status,
      record.publicSubscriptionKey || null,
      JSON.stringify(record.configJson),
      record.lastEventAt ? new Date(record.lastEventAt) : null,
      record.lastError || null,
      record.createdBy,
      record.updatedBy,
      record.createdAt,
      record.updatedAt,
    ]);
    return toEventSubscriptionRecord(result.rows[0]);
  }

  async updateEventSubscription(record: EventSubscriptionRecord): Promise<EventSubscriptionRecord> {
    const result = await this.queryable.query(`
      UPDATE event_subscriptions
      SET workspace_id = $2,
          connector_binding_id = $3,
          trigger_binding_id = $4,
          event_type = $5,
          status = $6,
          public_subscription_key = $7,
          config_json = $8::jsonb,
          last_event_at = $9,
          last_error = $10,
          updated_by = $11,
          updated_at = to_timestamp($12 / 1000.0)
      WHERE event_subscription_id = $1
      RETURNING *
    `, [
      record.eventSubscriptionId,
      record.workspaceId,
      record.connectorBindingId,
      record.triggerBindingId,
      record.eventType,
      record.status,
      record.publicSubscriptionKey || null,
      JSON.stringify(record.configJson),
      record.lastEventAt ? new Date(record.lastEventAt) : null,
      record.lastError || null,
      record.updatedBy,
      record.updatedAt,
    ]);
    return toEventSubscriptionRecord(result.rows[0]);
  }

  async listDueScheduleTriggers(timestamp: number): Promise<DueScheduleTrigger[]> {
    const result = await this.queryable.query(`
      SELECT trigger_binding_id, agent_id, workspace_id, next_trigger_at, config_json
      FROM trigger_bindings
      WHERE trigger_kind = 'schedule'
        AND status = 'enabled'
        AND next_trigger_at IS NOT NULL
        AND next_trigger_at <= to_timestamp($1 / 1000.0)
      ORDER BY next_trigger_at ASC
    `, [timestamp]);
    return result.rows.map((row) => ({
      triggerBindingId: String(row.trigger_binding_id),
      agentId: String(row.agent_id),
      workspaceId: String(row.workspace_id),
      nextTriggerAt: toMs(row.next_trigger_at),
      configJson: parseJson(row.config_json, {}),
    }));
  }

  async listPolicyBindings(): Promise<PolicyBindingRecord[]> {
    const result = await this.queryable.query('SELECT * FROM policy_bindings ORDER BY updated_at DESC');
    return result.rows.map((row) => toPolicyBindingRecord(row));
  }

  async listPolicyBindingsForTarget(targetType: string, targetRef: string): Promise<PolicyBindingRecord[]> {
    const result = await this.queryable.query(`
      SELECT * FROM policy_bindings WHERE target_type = $1 AND target_ref = $2
    `, [targetType, targetRef]);
    return result.rows.map((row) => toPolicyBindingRecord(row));
  }

  async getPolicyBinding(policyBindingId: string): Promise<PolicyBindingRecord | undefined> {
    const result = await this.queryable.query('SELECT * FROM policy_bindings WHERE policy_binding_id = $1', [policyBindingId]);
    return result.rows[0] ? toPolicyBindingRecord(result.rows[0]) : undefined;
  }

  async createPolicyBinding(record: PolicyBindingRecord): Promise<PolicyBindingRecord> {
    const result = await this.queryable.query(`
      INSERT INTO policy_bindings (
        policy_binding_id, workspace_id, policy_kind, target_type, target_ref,
        status, config_json, created_by, updated_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7::jsonb, $8, $9, to_timestamp($10 / 1000.0), to_timestamp($11 / 1000.0)
      )
      RETURNING *
    `, [
      record.policyBindingId,
      record.workspaceId,
      record.policyKind,
      record.targetType,
      record.targetRef,
      record.status,
      JSON.stringify(record.configJson),
      record.createdBy,
      record.updatedBy,
      record.createdAt,
      record.updatedAt,
    ]);
    return toPolicyBindingRecord(result.rows[0]);
  }

  async updatePolicyBinding(record: PolicyBindingRecord): Promise<PolicyBindingRecord> {
    const result = await this.queryable.query(`
      UPDATE policy_bindings
      SET workspace_id = $2,
          policy_kind = $3,
          target_type = $4,
          target_ref = $5,
          status = $6,
          config_json = $7::jsonb,
          updated_by = $8,
          updated_at = to_timestamp($9 / 1000.0)
      WHERE policy_binding_id = $1
      RETURNING *
    `, [
      record.policyBindingId,
      record.workspaceId,
      record.policyKind,
      record.targetType,
      record.targetRef,
      record.status,
      JSON.stringify(record.configJson),
      record.updatedBy,
      record.updatedAt,
    ]);
    return toPolicyBindingRecord(result.rows[0]);
  }

  async listSecretRefs(): Promise<SecretRefRecord[]> {
    const result = await this.queryable.query('SELECT * FROM secret_refs ORDER BY updated_at DESC');
    return result.rows.map((row) => toSecretRefRecord(row));
  }

  async getSecretRef(secretRefId: string): Promise<SecretRefRecord | undefined> {
    const result = await this.queryable.query('SELECT * FROM secret_refs WHERE secret_ref_id = $1', [secretRefId]);
    return result.rows[0] ? toSecretRefRecord(result.rows[0]) : undefined;
  }

  async createSecretRef(record: SecretRefRecord): Promise<SecretRefRecord> {
    const result = await this.queryable.query(`
      INSERT INTO secret_refs (
        secret_ref_id, workspace_id, environment_scope, provider_type, status,
        metadata_json, created_by, updated_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6::jsonb, $7, $8, to_timestamp($9 / 1000.0), to_timestamp($10 / 1000.0)
      )
      RETURNING *
    `, [
      record.secretRefId,
      record.workspaceId,
      record.environmentScope,
      record.providerType,
      record.status,
      JSON.stringify(record.metadataJson),
      record.createdBy,
      record.updatedBy,
      record.createdAt,
      record.updatedAt,
    ]);
    return toSecretRefRecord(result.rows[0]);
  }

  async listScopeGrants(): Promise<ScopeGrantRecord[]> {
    const result = await this.queryable.query('SELECT * FROM scope_grants ORDER BY updated_at DESC');
    return result.rows.map((row) => toScopeGrantRecord(row));
  }

  async listScopeGrantsForTarget(targetType: string, targetRef: string): Promise<ScopeGrantRecord[]> {
    const result = await this.queryable.query(`
      SELECT * FROM scope_grants WHERE target_type = $1 AND target_ref = $2
    `, [targetType, targetRef]);
    return result.rows.map((row) => toScopeGrantRecord(row));
  }

  async getScopeGrant(scopeGrantId: string): Promise<ScopeGrantRecord | undefined> {
    const result = await this.queryable.query('SELECT * FROM scope_grants WHERE scope_grant_id = $1', [scopeGrantId]);
    return result.rows[0] ? toScopeGrantRecord(result.rows[0]) : undefined;
  }

  async createScopeGrant(record: ScopeGrantRecord): Promise<ScopeGrantRecord> {
    const result = await this.queryable.query(`
      INSERT INTO scope_grants (
        scope_grant_id, workspace_id, target_type, target_ref, resource_type, resource_ref,
        status, scope_json, expires_at, created_by, updated_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8::jsonb, to_timestamp($9 / 1000.0), $10, $11, to_timestamp($12 / 1000.0), to_timestamp($13 / 1000.0)
      )
      RETURNING *
    `, [
      record.scopeGrantId,
      record.workspaceId,
      record.targetType,
      record.targetRef,
      record.resourceType,
      record.resourceRef,
      record.status,
      JSON.stringify(record.scopeJson),
      record.expiresAt || null,
      record.createdBy,
      record.updatedBy,
      record.createdAt,
      record.updatedAt,
    ]);
    return toScopeGrantRecord(result.rows[0]);
  }

  async updateScopeGrant(record: ScopeGrantRecord): Promise<ScopeGrantRecord> {
    const result = await this.queryable.query(`
      UPDATE scope_grants
      SET workspace_id = $2,
          target_type = $3,
          target_ref = $4,
          resource_type = $5,
          resource_ref = $6,
          status = $7,
          scope_json = $8::jsonb,
          expires_at = to_timestamp($9 / 1000.0),
          updated_by = $10,
          updated_at = to_timestamp($11 / 1000.0)
      WHERE scope_grant_id = $1
      RETURNING *
    `, [
      record.scopeGrantId,
      record.workspaceId,
      record.targetType,
      record.targetRef,
      record.resourceType,
      record.resourceRef,
      record.status,
      JSON.stringify(record.scopeJson),
      record.expiresAt || null,
      record.updatedBy,
      record.updatedAt,
    ]);
    return toScopeGrantRecord(result.rows[0]);
  }

  async listGovernanceChangeRequests(): Promise<GovernanceChangeRequestRecord[]> {
    const result = await this.queryable.query('SELECT * FROM governance_change_requests ORDER BY updated_at DESC');
    return result.rows.map((row) => toGovernanceChangeRequestRecord(row));
  }

  async getGovernanceChangeRequest(requestId: string): Promise<GovernanceChangeRequestRecord | undefined> {
    const result = await this.queryable.query('SELECT * FROM governance_change_requests WHERE request_id = $1', [requestId]);
    return result.rows[0] ? toGovernanceChangeRequestRecord(result.rows[0]) : undefined;
  }

  async createGovernanceChangeRequest(record: GovernanceChangeRequestRecord): Promise<GovernanceChangeRequestRecord> {
    const result = await this.queryable.query(`
      INSERT INTO governance_change_requests (
        request_id, workspace_id, request_kind, target_type, target_ref,
        requested_by_actor_id, status, risk_level, summary, justification,
        desired_state_json, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11::jsonb, to_timestamp($12 / 1000.0), to_timestamp($13 / 1000.0)
      )
      RETURNING *
    `, [
      record.requestId,
      record.workspaceId,
      record.requestKind,
      record.targetType,
      record.targetRef,
      record.requestedByActorId,
      record.status,
      record.riskLevel,
      record.summary,
      record.justification || null,
      JSON.stringify(record.desiredStateJson),
      record.createdAt,
      record.updatedAt,
    ]);
    return toGovernanceChangeRequestRecord(result.rows[0]);
  }

  async updateGovernanceChangeRequest(record: GovernanceChangeRequestRecord): Promise<GovernanceChangeRequestRecord> {
    const result = await this.queryable.query(`
      UPDATE governance_change_requests
      SET workspace_id = $2,
          request_kind = $3,
          target_type = $4,
          target_ref = $5,
          requested_by_actor_id = $6,
          status = $7,
          risk_level = $8,
          summary = $9,
          justification = $10,
          desired_state_json = $11::jsonb,
          updated_at = to_timestamp($12 / 1000.0)
      WHERE request_id = $1
      RETURNING *
    `, [
      record.requestId,
      record.workspaceId,
      record.requestKind,
      record.targetType,
      record.targetRef,
      record.requestedByActorId,
      record.status,
      record.riskLevel,
      record.summary,
      record.justification || null,
      JSON.stringify(record.desiredStateJson),
      record.updatedAt,
    ]);
    return toGovernanceChangeRequestRecord(result.rows[0]);
  }

  async listGovernanceChangeDecisions(requestId: string): Promise<GovernanceChangeDecisionRecord[]> {
    const result = await this.queryable.query(`
      SELECT * FROM governance_change_decisions WHERE request_id = $1 ORDER BY decided_at ASC
    `, [requestId]);
    return result.rows.map((row) => toGovernanceChangeDecisionRecord(row));
  }

  async createGovernanceChangeDecision(record: GovernanceChangeDecisionRecord): Promise<GovernanceChangeDecisionRecord> {
    const result = await this.queryable.query(`
      INSERT INTO governance_change_decisions (
        decision_id, request_id, actor_ref, decision, comment, decided_at
      ) VALUES (
        $1, $2, $3, $4, $5, to_timestamp($6 / 1000.0)
      )
      RETURNING *
    `, [
      record.decisionId,
      record.requestId,
      record.actorRef,
      record.decision,
      record.comment || null,
      record.decidedAt,
    ]);
    return toGovernanceChangeDecisionRecord(result.rows[0]);
  }

  async getTriggerDispatchByKey(dispatchKey: string): Promise<TriggerDispatchRecord | undefined> {
    const result = await this.queryable.query('SELECT * FROM trigger_dispatches WHERE dispatch_key = $1', [dispatchKey]);
    return result.rows[0] ? toTriggerDispatchRecord(result.rows[0]) : undefined;
  }

  async createTriggerDispatch(record: TriggerDispatchRecord): Promise<TriggerDispatchRecord> {
    const result = await this.queryable.query(`
      INSERT INTO trigger_dispatches (
        trigger_dispatch_id, trigger_binding_id, dispatch_key, source_type, status,
        run_id, payload_json, error_message, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7::jsonb, $8, to_timestamp($9 / 1000.0), to_timestamp($10 / 1000.0)
      )
      RETURNING *
    `, [
      record.triggerDispatchId,
      record.triggerBindingId,
      record.dispatchKey,
      record.sourceType,
      record.status,
      record.runId || null,
      record.payloadJson ? JSON.stringify(record.payloadJson) : null,
      record.errorMessage || null,
      record.createdAt,
      record.updatedAt,
    ]);
    return toTriggerDispatchRecord(result.rows[0]);
  }

  async updateTriggerDispatch(record: TriggerDispatchRecord): Promise<TriggerDispatchRecord> {
    const result = await this.queryable.query(`
      UPDATE trigger_dispatches
      SET status = $2,
          run_id = $3,
          payload_json = $4::jsonb,
          error_message = $5,
          updated_at = to_timestamp($6 / 1000.0)
      WHERE dispatch_key = $1
      RETURNING *
    `, [
      record.dispatchKey,
      record.status,
      record.runId || null,
      record.payloadJson ? JSON.stringify(record.payloadJson) : null,
      record.errorMessage || null,
      record.updatedAt,
    ]);
    return toTriggerDispatchRecord(result.rows[0]);
  }
}

export function createGovernanceRepository(databaseUrl?: string): GovernanceRepository {
  if (!databaseUrl) {
    return new MemoryGovernanceRepository();
  }
  return new PostgresGovernanceRepository(databaseUrl);
}
