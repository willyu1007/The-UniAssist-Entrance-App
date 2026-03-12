import { Pool, type PoolClient } from 'pg';

import type {
  AgentDefinitionRecord,
  DueScheduleTrigger,
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
  lockTriggerBinding: (triggerBindingId: string) => Promise<void>;
  listAgents: () => Promise<AgentDefinitionRecord[]>;
  getAgent: (agentId: string) => Promise<AgentDefinitionRecord | undefined>;
  createAgent: (record: AgentDefinitionRecord) => Promise<AgentDefinitionRecord>;
  updateAgent: (record: AgentDefinitionRecord) => Promise<AgentDefinitionRecord>;
  listTriggerBindingsByAgent: (agentId: string) => Promise<TriggerBindingRecord[]>;
  getTriggerBinding: (triggerBindingId: string) => Promise<TriggerBindingRecord | undefined>;
  getTriggerBindingByPublicKey: (publicTriggerKey: string) => Promise<TriggerBindingRecord | undefined>;
  createTriggerBinding: (record: TriggerBindingRecord) => Promise<TriggerBindingRecord>;
  updateTriggerBinding: (record: TriggerBindingRecord) => Promise<TriggerBindingRecord>;
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
  private readonly triggerBindings = new Map<string, TriggerBindingRecord>();
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

  async lockTriggerBinding(_triggerBindingId: string): Promise<void> {
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

  async lockTriggerBinding(triggerBindingId: string): Promise<void> {
    await this.queryable.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`trigger:${triggerBindingId}`]);
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
        identity_ref, executor_strategy, tool_profile, risk_level, owner_actor_ref,
        created_by, updated_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, to_timestamp($14 / 1000.0), to_timestamp($15 / 1000.0)
      )
      RETURNING *
    `, [
      record.agentId,
      record.workspaceId,
      record.templateVersionRef,
      record.name,
      record.description || null,
      record.activationState,
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
          identity_ref = $7,
          executor_strategy = $8,
          tool_profile = $9,
          risk_level = $10,
          owner_actor_ref = $11,
          updated_by = $12,
          updated_at = to_timestamp($13 / 1000.0)
      WHERE agent_id = $1
      RETURNING *
    `, [
      record.agentId,
      record.workspaceId,
      record.templateVersionRef,
      record.name,
      record.description || null,
      record.activationState,
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
