import { Pool, type PoolClient } from 'pg';

import type {
  ActorMembershipRecord,
  ActorProfileRecord,
  AudienceSelectorRecord,
  BridgeCallbackReceiptRecord,
  BridgeInvokeSessionRecord,
  ConnectorActionSessionRecord,
  ConnectorEventReceiptRecord,
  DeliverySpecRecord,
  DeliveryTargetRecord,
  WorkflowApprovalDecisionRecord,
  WorkflowApprovalRequestRecord,
  WorkflowArtifactRecord,
  WorkflowNodeRunRecord,
  WorkflowRunRecord,
  WorkflowTemplateRecord,
  WorkflowTemplateVersionRecord,
} from '@baseinterface/workflow-contracts';
import type { InternalRunState } from './store';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Array.isArray(value) === false;
}

function parseConnectorActionSessions(value: unknown): ConnectorActionSessionRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((item) => (
      typeof item.connectorActionSessionId === 'string'
      && typeof item.runId === 'string'
      && typeof item.nodeRunId === 'string'
      && typeof item.actionBindingId === 'string'
      && typeof item.connectorBindingId === 'string'
      && typeof item.capabilityId === 'string'
      && typeof item.externalSessionRef === 'string'
      && typeof item.publicCallbackKey === 'string'
      && typeof item.status === 'string'
      && typeof item.lastSequence === 'number'
      && typeof item.createdAt === 'number'
      && typeof item.updatedAt === 'number'
    ))
    .map((item) => ({
      connectorActionSessionId: String(item.connectorActionSessionId),
      runId: String(item.runId),
      nodeRunId: String(item.nodeRunId),
      actionBindingId: String(item.actionBindingId),
      connectorBindingId: String(item.connectorBindingId),
      capabilityId: String(item.capabilityId),
      externalSessionRef: String(item.externalSessionRef),
      publicCallbackKey: String(item.publicCallbackKey),
      status: String(item.status) as ConnectorActionSessionRecord['status'],
      lastSequence: Number(item.lastSequence),
      cancelledAt: typeof item.cancelledAt === 'number' ? item.cancelledAt : undefined,
      metadataJson: parseJson(item.metadataJson, undefined),
      createdAt: Number(item.createdAt),
      updatedAt: Number(item.updatedAt),
    }));
}

function parseConnectorEventReceipts(value: unknown): ConnectorEventReceiptRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((item) => (
      typeof item.connectorEventReceiptId === 'string'
      && typeof item.receiptKey === 'string'
      && typeof item.sourceKind === 'string'
      && typeof item.status === 'string'
      && typeof item.receivedAt === 'number'
    ))
    .map((item) => ({
      connectorEventReceiptId: String(item.connectorEventReceiptId),
      receiptKey: String(item.receiptKey),
      sourceKind: String(item.sourceKind) as ConnectorEventReceiptRecord['sourceKind'],
      connectorActionSessionId: typeof item.connectorActionSessionId === 'string' ? item.connectorActionSessionId : undefined,
      eventSubscriptionId: typeof item.eventSubscriptionId === 'string' ? item.eventSubscriptionId : undefined,
      sequence: typeof item.sequence === 'number' ? item.sequence : undefined,
      eventType: typeof item.eventType === 'string' ? item.eventType : undefined,
      status: String(item.status) as ConnectorEventReceiptRecord['status'],
      errorMessage: typeof item.errorMessage === 'string' ? item.errorMessage : undefined,
      receivedAt: Number(item.receivedAt),
    }));
}

function toTemplateRecord(row: Record<string, unknown>): WorkflowTemplateRecord {
  return {
    workflowId: String(row.template_id),
    workflowKey: String(row.workflow_key),
    name: String(row.template_name),
    compatProviderId: String(row.template_compat_provider_id),
    status: row.template_status === 'archived' ? 'archived' : 'active',
    createdAt: toMs(row.template_created_at),
    updatedAt: toMs(row.template_updated_at),
  };
}

function toTemplateVersionRecord(row: Record<string, unknown>): WorkflowTemplateVersionRecord {
  return {
    templateVersionId: String(row.template_version_id),
    workflowId: String(row.template_id),
    workflowKey: String(row.workflow_key),
    version: Number(row.template_version_number),
    status: row.template_version_status === 'archived'
      ? 'archived'
      : row.template_version_status === 'superseded'
        ? 'superseded'
        : 'published',
    spec: parseJson(row.spec_json, {}),
    createdAt: toMs(row.template_version_created_at),
  } as WorkflowTemplateVersionRecord;
}

function toRunRecord(row: Record<string, unknown>): WorkflowRunRecord {
  return {
    runId: String(row.run_id),
    workflowId: String(row.template_id),
    workflowKey: String(row.workflow_key),
    templateVersionId: String(row.template_version_id),
    compatProviderId: String(row.compat_provider_id),
    status: String(row.status) as WorkflowRunRecord['status'],
    sessionId: String(row.session_id),
    userId: String(row.user_id),
    currentNodeRunId: row.current_node_run_id ? String(row.current_node_run_id) : undefined,
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
    completedAt: row.completed_at ? toMs(row.completed_at) : undefined,
    metadata: parseJson(row.metadata_json, undefined),
  };
}

function toNodeRunRecord(row: Record<string, unknown>): WorkflowNodeRunRecord {
  return {
    nodeRunId: String(row.node_run_id),
    runId: String(row.run_id),
    nodeKey: String(row.node_key),
    nodeType: String(row.node_type) as WorkflowNodeRunRecord['nodeType'],
    status: String(row.status) as WorkflowNodeRunRecord['status'],
    executorId: row.executor_id ? String(row.executor_id) : undefined,
    attempt: Number(row.attempt),
    waitKey: row.wait_key ? String(row.wait_key) : undefined,
    taskId: row.task_id ? String(row.task_id) : undefined,
    questionId: row.question_id ? String(row.question_id) : undefined,
    replyToken: row.reply_token ? String(row.reply_token) : undefined,
    compatTaskState: row.compat_task_state ? String(row.compat_task_state) as WorkflowNodeRunRecord['compatTaskState'] : undefined,
    executionPolicy: row.execution_policy ? String(row.execution_policy) as WorkflowNodeRunRecord['executionPolicy'] : undefined,
    inputJson: parseJson(row.input_json, undefined),
    outputArtifactId: row.output_artifact_id ? String(row.output_artifact_id) : undefined,
    metadata: parseJson(row.metadata_json, undefined),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toArtifactRecord(row: Record<string, unknown>): WorkflowArtifactRecord {
  return {
    artifactId: String(row.artifact_id),
    runId: String(row.run_id),
    nodeRunId: row.node_run_id ? String(row.node_run_id) : undefined,
    artifactType: String(row.artifact_type),
    state: String(row.state) as WorkflowArtifactRecord['state'],
    schemaRef: row.schema_ref ? String(row.schema_ref) : undefined,
    payloadJson: parseJson(row.payload_json, {}),
    metadataJson: parseJson(row.metadata_json, undefined),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toApprovalRecord(row: Record<string, unknown>): WorkflowApprovalRequestRecord {
  return {
    approvalRequestId: String(row.approval_request_id),
    runId: String(row.run_id),
    nodeRunId: row.node_run_id ? String(row.node_run_id) : undefined,
    artifactId: row.artifact_id ? String(row.artifact_id) : undefined,
    status: String(row.status) as WorkflowApprovalRequestRecord['status'],
    requestedActorId: row.requested_actor_id ? String(row.requested_actor_id) : undefined,
    expiresAt: row.expires_at ? toMs(row.expires_at) : undefined,
    payloadJson: parseJson(row.payload_json, undefined),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toDecisionRecord(row: Record<string, unknown>): WorkflowApprovalDecisionRecord {
  return {
    approvalDecisionId: String(row.approval_decision_id),
    approvalRequestId: String(row.approval_request_id),
    decision: String(row.decision) as WorkflowApprovalDecisionRecord['decision'],
    decidedActorId: row.decided_actor_id ? String(row.decided_actor_id) : undefined,
    comment: row.comment ? String(row.comment) : undefined,
    payloadJson: parseJson(row.payload_json, undefined),
    createdAt: toMs(row.created_at),
  };
}

function toActorProfileRecord(row: Record<string, unknown>): ActorProfileRecord {
  return {
    runId: String(row.run_id),
    actorId: String(row.actor_id),
    workspaceId: String(row.workspace_id),
    status: String(row.status) as ActorProfileRecord['status'],
    displayName: String(row.display_name),
    actorType: String(row.actor_type) as ActorProfileRecord['actorType'],
    payloadJson: parseJson(row.payload_json, undefined),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toActorMembershipRecord(row: Record<string, unknown>): ActorMembershipRecord {
  return {
    runId: String(row.run_id),
    actorMembershipId: String(row.actor_membership_id),
    fromActorId: String(row.from_actor_id),
    toActorId: String(row.to_actor_id),
    relationType: String(row.relation_type),
    status: String(row.status) as ActorMembershipRecord['status'],
    confirmedAt: row.confirmed_at ? toMs(row.confirmed_at) : undefined,
    payloadJson: parseJson(row.payload_json, undefined),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toAudienceSelectorRecord(row: Record<string, unknown>): AudienceSelectorRecord {
  return {
    audienceSelectorId: String(row.audience_selector_id),
    status: String(row.status) as AudienceSelectorRecord['status'],
    selectorJson: parseJson(row.selector_json, {}),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toDeliverySpecRecord(row: Record<string, unknown>): DeliverySpecRecord {
  return {
    deliverySpecId: String(row.delivery_spec_id),
    audienceSelectorId: String(row.audience_selector_id),
    reviewRequired: Boolean(row.review_required),
    deliveryMode: String(row.delivery_mode) as DeliverySpecRecord['deliveryMode'],
    status: String(row.status) as DeliverySpecRecord['status'],
    configJson: parseJson(row.config_json, undefined),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toDeliveryTargetRecord(row: Record<string, unknown>): DeliveryTargetRecord {
  return {
    deliveryTargetId: String(row.delivery_target_id),
    runId: String(row.run_id),
    deliverySpecId: String(row.delivery_spec_id),
    targetActorId: row.target_actor_id ? String(row.target_actor_id) : undefined,
    status: String(row.status) as DeliveryTargetRecord['status'],
    payloadJson: parseJson(row.payload_json, undefined),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toBridgeInvokeSessionRecord(row: Record<string, unknown>): BridgeInvokeSessionRecord {
  return {
    bridgeSessionId: String(row.bridge_session_id),
    runId: String(row.run_id),
    nodeRunId: String(row.node_run_id),
    bridgeId: String(row.bridge_id),
    externalSessionRef: String(row.external_session_ref),
    status: String(row.status) as BridgeInvokeSessionRecord['status'],
    lastSequence: Number(row.last_sequence),
    resumeToken: row.resume_token ? String(row.resume_token) : undefined,
    cancelledAt: row.cancelled_at ? toMs(row.cancelled_at) : undefined,
    metadataJson: parseJson(row.metadata_json, undefined),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toBridgeCallbackReceiptRecord(row: Record<string, unknown>): BridgeCallbackReceiptRecord {
  return {
    callbackReceiptId: String(row.callback_receipt_id),
    callbackId: String(row.callback_id),
    bridgeSessionId: String(row.bridge_session_id),
    sequence: Number(row.sequence),
    kind: String(row.kind) as BridgeCallbackReceiptRecord['kind'],
    status: String(row.status) as BridgeCallbackReceiptRecord['status'],
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    receivedAt: toMs(row.received_at),
  };
}

export type RuntimeRepository = {
  close: () => Promise<void>;
  saveState: (state: InternalRunState) => Promise<void>;
  loadRunState: (runId: string) => Promise<InternalRunState | undefined>;
  findRunStateByConnectorPublicCallbackKey: (publicCallbackKey: string) => Promise<InternalRunState | undefined>;
  listRunStates: (limit?: number) => Promise<InternalRunState[]>;
  listApprovals: () => Promise<WorkflowApprovalRequestRecord[]>;
  getApproval: (approvalRequestId: string) => Promise<WorkflowApprovalRequestRecord | undefined>;
  getArtifact: (artifactId: string) => Promise<WorkflowArtifactRecord | undefined>;
};

class PgRuntimeRepository implements RuntimeRepository {
  private readonly pool: Pool;

  constructor(databaseUrlOrPool: string | Pool) {
    this.pool = typeof databaseUrlOrPool === 'string'
      ? new Pool({ connectionString: databaseUrlOrPool })
      : databaseUrlOrPool;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async saveState(state: InternalRunState): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.upsertRun(client, state);
      for (const nodeRun of state.nodeRuns) {
        await this.upsertNodeRun(client, nodeRun);
      }
      for (const artifact of state.artifacts) {
        await this.upsertArtifact(client, artifact);
      }
      for (const approval of state.approvals) {
        await this.upsertApproval(client, approval);
      }
      for (const decision of state.decisions) {
        await this.upsertDecision(client, decision);
      }
      for (const actorProfile of state.actorProfiles) {
        await this.upsertActorProfile(client, actorProfile);
      }
      for (const actorMembership of state.actorMemberships) {
        await this.upsertActorMembership(client, actorMembership);
      }
      for (const audienceSelector of state.audienceSelectors) {
        await this.upsertAudienceSelector(client, audienceSelector);
      }
      for (const deliverySpec of state.deliverySpecs) {
        await this.upsertDeliverySpec(client, deliverySpec);
      }
      for (const deliveryTarget of state.deliveryTargets) {
        await this.upsertDeliveryTarget(client, deliveryTarget);
      }
      for (const bridgeSession of state.bridgeInvokeSessions) {
        await this.upsertBridgeInvokeSession(client, bridgeSession);
      }
      for (const callbackReceipt of state.bridgeCallbackReceipts) {
        await this.upsertBridgeCallbackReceipt(client, callbackReceipt);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async loadRunState(runId: string): Promise<InternalRunState | undefined> {
    const runResult = await this.pool.query(`
      SELECT
        r.*,
        t.workflow_key,
        t.name AS template_name,
        t.compat_provider_id AS template_compat_provider_id,
        t.status AS template_status,
        t.created_at AS template_created_at,
        t.updated_at AS template_updated_at,
        v.version AS template_version_number,
        v.status AS template_version_status,
        v.spec_json,
        v.created_at AS template_version_created_at
      FROM workflow_runs r
      JOIN workflow_templates t
        ON t.workflow_id = r.template_id
      JOIN workflow_template_versions v
        ON v.template_version_id = r.template_version_id
      WHERE r.run_id = $1
    `, [runId]);
    if (runResult.rowCount === 0) {
      return undefined;
    }

    const runRow = runResult.rows[0] as Record<string, unknown>;
    const template = toTemplateRecord(runRow);
    const version = toTemplateVersionRecord(runRow);
    const run = toRunRecord(runRow);

    const nodeRunsResult = await this.pool.query(`
      SELECT *
      FROM workflow_node_runs
      WHERE run_id = $1
      ORDER BY created_at ASC
    `, [runId]);
    const nodeRuns = nodeRunsResult.rows.map((row) => toNodeRunRecord(row as Record<string, unknown>));
    const firstInput = nodeRuns.find((item) => item.inputJson && Object.keys(item.inputJson).length > 0)?.inputJson;
    if (!run.metadata?.inputPayload && firstInput) {
      run.metadata = {
        ...(run.metadata || {}),
        inputPayload: firstInput,
      };
    }

    const artifactsResult = await this.pool.query(`
      SELECT *
      FROM artifacts
      WHERE run_id = $1
      ORDER BY created_at ASC
    `, [runId]);
    const artifacts = artifactsResult.rows.map((row) => toArtifactRecord(row as Record<string, unknown>));

    const approvalsResult = await this.pool.query(`
      SELECT *
      FROM approval_requests
      WHERE run_id = $1
      ORDER BY created_at ASC
    `, [runId]);
    const approvals = approvalsResult.rows.map((row) => toApprovalRecord(row as Record<string, unknown>));

    const decisionsResult = await this.pool.query(`
      SELECT d.*
      FROM approval_decisions d
      JOIN approval_requests r
        ON r.approval_request_id = d.approval_request_id
      WHERE r.run_id = $1
      ORDER BY d.created_at ASC
    `, [runId]);
    const decisions = decisionsResult.rows.map((row) => toDecisionRecord(row as Record<string, unknown>));

    const actorProfilesResult = await this.pool.query(`
      SELECT *
      FROM actor_profiles
      WHERE run_id = $1
      ORDER BY created_at ASC
    `, [runId]);
    const actorProfiles = actorProfilesResult.rows.map((row) => toActorProfileRecord(row as Record<string, unknown>));
    const actorMembershipsResult = await this.pool.query(`
      SELECT *
      FROM actor_memberships
      WHERE run_id = $1
      ORDER BY created_at ASC
    `, [runId]);
    const actorMemberships = actorMembershipsResult.rows.map((row) => toActorMembershipRecord(row as Record<string, unknown>));

    const deliveryTargetsResult = await this.pool.query(`
      SELECT *
      FROM delivery_targets
      WHERE run_id = $1
      ORDER BY created_at ASC
    `, [runId]);
    const deliveryTargets = deliveryTargetsResult.rows.map((row) => toDeliveryTargetRecord(row as Record<string, unknown>));
    const deliverySpecIds = [...new Set(deliveryTargets.map((item) => item.deliverySpecId))];

    let deliverySpecs: DeliverySpecRecord[] = [];
    let audienceSelectors: AudienceSelectorRecord[] = [];
    if (deliverySpecIds.length > 0) {
      const deliverySpecsResult = await this.pool.query(`
        SELECT *
        FROM delivery_specs
        WHERE delivery_spec_id = ANY($1::text[])
        ORDER BY created_at ASC
      `, [deliverySpecIds]);
      deliverySpecs = deliverySpecsResult.rows.map((row) => toDeliverySpecRecord(row as Record<string, unknown>));
      const audienceSelectorIds = [...new Set(deliverySpecs.map((item) => item.audienceSelectorId))];
      if (audienceSelectorIds.length > 0) {
        const audienceSelectorsResult = await this.pool.query(`
          SELECT *
          FROM audience_selectors
          WHERE audience_selector_id = ANY($1::text[])
          ORDER BY created_at ASC
        `, [audienceSelectorIds]);
        audienceSelectors = audienceSelectorsResult.rows.map((row) => toAudienceSelectorRecord(row as Record<string, unknown>));
      }
    }

    const bridgeSessionsResult = await this.pool.query(`
      SELECT *
      FROM bridge_invoke_sessions
      WHERE run_id = $1
      ORDER BY created_at ASC
    `, [runId]);
    const bridgeInvokeSessions = bridgeSessionsResult.rows.map((row) => toBridgeInvokeSessionRecord(row as Record<string, unknown>));

    let bridgeCallbackReceipts: BridgeCallbackReceiptRecord[] = [];
    const bridgeSessionIds = bridgeInvokeSessions.map((item) => item.bridgeSessionId);
    if (bridgeSessionIds.length > 0) {
      const callbackReceiptsResult = await this.pool.query(`
        SELECT *
        FROM bridge_callback_receipts
        WHERE bridge_session_id = ANY($1::text[])
        ORDER BY received_at ASC
      `, [bridgeSessionIds]);
      bridgeCallbackReceipts = callbackReceiptsResult.rows.map((row) => toBridgeCallbackReceiptRecord(row as Record<string, unknown>));
    }

    const connectorRuntime = isRecord(run.metadata?.connectorRuntime)
      ? run.metadata?.connectorRuntime as Record<string, unknown>
      : {};

    return {
      template,
      version,
      run,
      nodeRuns,
      approvals,
      decisions,
      artifacts,
      actorProfiles,
      actorMemberships,
      audienceSelectors,
      deliverySpecs,
      deliveryTargets,
      bridgeInvokeSessions,
      bridgeCallbackReceipts,
      connectorActionSessions: parseConnectorActionSessions(connectorRuntime.actionSessions),
      connectorEventReceipts: parseConnectorEventReceipts(connectorRuntime.eventReceipts),
    };
  }

  async findRunStateByConnectorPublicCallbackKey(publicCallbackKey: string): Promise<InternalRunState | undefined> {
    const result = await this.pool.query(`
      SELECT run_id
      FROM workflow_runs
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(metadata_json -> 'connectorRuntime' -> 'actionSessions', '[]'::jsonb)) AS action_session
        WHERE action_session ->> 'publicCallbackKey' = $1
      )
      ORDER BY updated_at DESC
      LIMIT 1
    `, [publicCallbackKey]);
    if (result.rowCount === 0) {
      return undefined;
    }
    return await this.loadRunState(String((result.rows[0] as Record<string, unknown>).run_id));
  }

  async listRunStates(limit = 25): Promise<InternalRunState[]> {
    const result = await this.pool.query(`
      SELECT run_id
      FROM workflow_runs
      ORDER BY updated_at DESC
      LIMIT $1
    `, [limit]);
    const states = await Promise.all(
      result.rows.map(async (row) => await this.loadRunState(String((row as Record<string, unknown>).run_id))),
    );
    return states.filter((item): item is InternalRunState => Boolean(item));
  }

  async listApprovals(): Promise<WorkflowApprovalRequestRecord[]> {
    const result = await this.pool.query(`
      SELECT *
      FROM approval_requests
      ORDER BY created_at DESC
    `);
    return result.rows.map((row) => toApprovalRecord(row as Record<string, unknown>));
  }

  async getApproval(approvalRequestId: string): Promise<WorkflowApprovalRequestRecord | undefined> {
    const result = await this.pool.query(`
      SELECT *
      FROM approval_requests
      WHERE approval_request_id = $1
      LIMIT 1
    `, [approvalRequestId]);
    return result.rows[0] ? toApprovalRecord(result.rows[0] as Record<string, unknown>) : undefined;
  }

  async getArtifact(artifactId: string): Promise<WorkflowArtifactRecord | undefined> {
    const result = await this.pool.query(`
      SELECT *
      FROM artifacts
      WHERE artifact_id = $1
      LIMIT 1
    `, [artifactId]);
    return result.rows[0] ? toArtifactRecord(result.rows[0] as Record<string, unknown>) : undefined;
  }

  private async upsertBridgeInvokeSession(client: PoolClient, record: BridgeInvokeSessionRecord): Promise<void> {
    await client.query(`
      INSERT INTO bridge_invoke_sessions (
        bridge_session_id,
        run_id,
        node_run_id,
        bridge_id,
        external_session_ref,
        status,
        last_sequence,
        resume_token,
        cancelled_at,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
        to_timestamp($11 / 1000.0), to_timestamp($12 / 1000.0)
      )
      ON CONFLICT (bridge_session_id) DO UPDATE
      SET
        status = EXCLUDED.status,
        last_sequence = EXCLUDED.last_sequence,
        resume_token = EXCLUDED.resume_token,
        cancelled_at = EXCLUDED.cancelled_at,
        metadata_json = EXCLUDED.metadata_json,
        updated_at = EXCLUDED.updated_at
    `, [
      record.bridgeSessionId,
      record.runId,
      record.nodeRunId,
      record.bridgeId,
      record.externalSessionRef,
      record.status,
      record.lastSequence,
      record.resumeToken ?? null,
      record.cancelledAt ? new Date(record.cancelledAt) : null,
      record.metadataJson ? JSON.stringify(record.metadataJson) : null,
      record.createdAt,
      record.updatedAt,
    ]);
  }

  private async upsertBridgeCallbackReceipt(client: PoolClient, record: BridgeCallbackReceiptRecord): Promise<void> {
    await client.query(`
      INSERT INTO bridge_callback_receipts (
        callback_receipt_id,
        callback_id,
        bridge_session_id,
        sequence,
        kind,
        status,
        error_message,
        received_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
      ON CONFLICT (callback_id) DO NOTHING
    `, [
      record.callbackReceiptId,
      record.callbackId,
      record.bridgeSessionId,
      record.sequence,
      record.kind,
      record.status,
      record.errorMessage ?? null,
      record.receivedAt,
    ]);
  }

  private async upsertRun(client: PoolClient, state: InternalRunState): Promise<void> {
    await client.query(`
      INSERT INTO workflow_runs (
        run_id,
        template_id,
        template_version_id,
        status,
        session_id,
        user_id,
        compat_provider_id,
        current_node_run_id,
        metadata_json,
        created_at,
        updated_at,
        completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, to_timestamp($10 / 1000.0), to_timestamp($11 / 1000.0), $12)
      ON CONFLICT (run_id) DO UPDATE
      SET
        status = EXCLUDED.status,
        current_node_run_id = EXCLUDED.current_node_run_id,
        metadata_json = EXCLUDED.metadata_json,
        updated_at = EXCLUDED.updated_at,
        completed_at = EXCLUDED.completed_at
    `, [
      state.run.runId,
      state.run.workflowId,
      state.run.templateVersionId,
      state.run.status,
      state.run.sessionId,
      state.run.userId,
      state.run.compatProviderId,
      state.run.currentNodeRunId ?? null,
      state.run.metadata ? JSON.stringify(state.run.metadata) : null,
      state.run.createdAt,
      state.run.updatedAt,
      state.run.completedAt ? new Date(state.run.completedAt) : null,
    ]);
  }

  private async upsertNodeRun(client: PoolClient, record: WorkflowNodeRunRecord): Promise<void> {
    await client.query(`
      INSERT INTO workflow_node_runs (
        node_run_id,
        run_id,
        node_key,
        node_type,
        status,
        executor_id,
        attempt,
        input_json,
        output_artifact_id,
        wait_key,
        task_id,
        question_id,
        reply_token,
        compat_task_state,
        execution_policy,
        metadata_json,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, to_timestamp($17 / 1000.0), to_timestamp($18 / 1000.0))
      ON CONFLICT (node_run_id) DO UPDATE
      SET
        status = EXCLUDED.status,
        executor_id = EXCLUDED.executor_id,
        attempt = EXCLUDED.attempt,
        input_json = EXCLUDED.input_json,
        output_artifact_id = EXCLUDED.output_artifact_id,
        wait_key = EXCLUDED.wait_key,
        task_id = EXCLUDED.task_id,
        question_id = EXCLUDED.question_id,
        reply_token = EXCLUDED.reply_token,
        compat_task_state = EXCLUDED.compat_task_state,
        execution_policy = EXCLUDED.execution_policy,
        metadata_json = EXCLUDED.metadata_json,
        updated_at = EXCLUDED.updated_at
    `, [
      record.nodeRunId,
      record.runId,
      record.nodeKey,
      record.nodeType,
      record.status,
      record.executorId ?? null,
      record.attempt,
      record.inputJson ? JSON.stringify(record.inputJson) : null,
      record.outputArtifactId ?? null,
      record.waitKey ?? null,
      record.taskId ?? null,
      record.questionId ?? null,
      record.replyToken ?? null,
      record.compatTaskState ?? null,
      record.executionPolicy ?? null,
      record.metadata ? JSON.stringify(record.metadata) : null,
      record.createdAt,
      record.updatedAt,
    ]);
  }

  private async upsertArtifact(client: PoolClient, record: WorkflowArtifactRecord): Promise<void> {
    await client.query(`
      INSERT INTO artifacts (
        artifact_id,
        run_id,
        node_run_id,
        artifact_type,
        state,
        schema_ref,
        payload_json,
        metadata_json,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, to_timestamp($9 / 1000.0), to_timestamp($10 / 1000.0))
      ON CONFLICT (artifact_id) DO UPDATE
      SET
        state = EXCLUDED.state,
        schema_ref = EXCLUDED.schema_ref,
        payload_json = EXCLUDED.payload_json,
        metadata_json = EXCLUDED.metadata_json,
        updated_at = EXCLUDED.updated_at
    `, [
      record.artifactId,
      record.runId,
      record.nodeRunId ?? null,
      record.artifactType,
      record.state,
      record.schemaRef ?? null,
      JSON.stringify(record.payloadJson),
      record.metadataJson ? JSON.stringify(record.metadataJson) : null,
      record.createdAt,
      record.updatedAt,
    ]);
  }

  private async upsertApproval(client: PoolClient, record: WorkflowApprovalRequestRecord): Promise<void> {
    await client.query(`
      INSERT INTO approval_requests (
        approval_request_id,
        run_id,
        node_run_id,
        artifact_id,
        status,
        requested_actor_id,
        expires_at,
        payload_json,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, to_timestamp($9 / 1000.0), to_timestamp($10 / 1000.0))
      ON CONFLICT (approval_request_id) DO UPDATE
      SET
        artifact_id = EXCLUDED.artifact_id,
        status = EXCLUDED.status,
        requested_actor_id = EXCLUDED.requested_actor_id,
        expires_at = EXCLUDED.expires_at,
        payload_json = EXCLUDED.payload_json,
        updated_at = EXCLUDED.updated_at
    `, [
      record.approvalRequestId,
      record.runId,
      record.nodeRunId ?? null,
      record.artifactId ?? null,
      record.status,
      record.requestedActorId ?? null,
      record.expiresAt ? new Date(record.expiresAt) : null,
      record.payloadJson ? JSON.stringify(record.payloadJson) : null,
      record.createdAt,
      record.updatedAt,
    ]);
  }

  private async upsertDecision(client: PoolClient, record: WorkflowApprovalDecisionRecord): Promise<void> {
    await client.query(`
      INSERT INTO approval_decisions (
        approval_decision_id,
        approval_request_id,
        decision,
        decided_actor_id,
        comment,
        payload_json,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, to_timestamp($7 / 1000.0))
      ON CONFLICT (approval_decision_id) DO UPDATE
      SET
        decision = EXCLUDED.decision,
        decided_actor_id = EXCLUDED.decided_actor_id,
        comment = EXCLUDED.comment,
        payload_json = EXCLUDED.payload_json
    `, [
      record.approvalDecisionId,
      record.approvalRequestId,
      record.decision,
      record.decidedActorId ?? null,
      record.comment ?? null,
      record.payloadJson ? JSON.stringify(record.payloadJson) : null,
      record.createdAt,
    ]);
  }

  private async upsertActorProfile(client: PoolClient, record: ActorProfileRecord): Promise<void> {
    await client.query(`
      INSERT INTO actor_profiles (
        run_id,
        actor_id,
        workspace_id,
        status,
        display_name,
        actor_type,
        payload_json,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, to_timestamp($8 / 1000.0), to_timestamp($9 / 1000.0))
      ON CONFLICT (run_id, actor_id) DO UPDATE
      SET
        workspace_id = EXCLUDED.workspace_id,
        status = EXCLUDED.status,
        display_name = EXCLUDED.display_name,
        actor_type = EXCLUDED.actor_type,
        payload_json = EXCLUDED.payload_json,
        updated_at = EXCLUDED.updated_at
    `, [
      record.runId,
      record.actorId,
      record.workspaceId,
      record.status,
      record.displayName,
      record.actorType,
      record.payloadJson ? JSON.stringify(record.payloadJson) : null,
      record.createdAt,
      record.updatedAt,
    ]);
  }

  private async upsertActorMembership(client: PoolClient, record: ActorMembershipRecord): Promise<void> {
    await client.query(`
      INSERT INTO actor_memberships (
        actor_membership_id,
        run_id,
        from_actor_id,
        to_actor_id,
        relation_type,
        status,
        confirmed_at,
        payload_json,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, to_timestamp($9 / 1000.0), to_timestamp($10 / 1000.0))
      ON CONFLICT (actor_membership_id) DO UPDATE
      SET
        run_id = EXCLUDED.run_id,
        relation_type = EXCLUDED.relation_type,
        status = EXCLUDED.status,
        confirmed_at = EXCLUDED.confirmed_at,
        payload_json = EXCLUDED.payload_json,
        updated_at = EXCLUDED.updated_at
    `, [
      record.actorMembershipId,
      record.runId,
      record.fromActorId,
      record.toActorId,
      record.relationType,
      record.status,
      record.confirmedAt ? new Date(record.confirmedAt) : null,
      record.payloadJson ? JSON.stringify(record.payloadJson) : null,
      record.createdAt,
      record.updatedAt,
    ]);
  }

  private async upsertAudienceSelector(client: PoolClient, record: AudienceSelectorRecord): Promise<void> {
    await client.query(`
      INSERT INTO audience_selectors (
        audience_selector_id,
        status,
        selector_json,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3::jsonb, to_timestamp($4 / 1000.0), to_timestamp($5 / 1000.0))
      ON CONFLICT (audience_selector_id) DO UPDATE
      SET
        status = EXCLUDED.status,
        selector_json = EXCLUDED.selector_json,
        updated_at = EXCLUDED.updated_at
    `, [
      record.audienceSelectorId,
      record.status,
      JSON.stringify(record.selectorJson),
      record.createdAt,
      record.updatedAt,
    ]);
  }

  private async upsertDeliverySpec(client: PoolClient, record: DeliverySpecRecord): Promise<void> {
    await client.query(`
      INSERT INTO delivery_specs (
        delivery_spec_id,
        audience_selector_id,
        review_required,
        delivery_mode,
        status,
        config_json,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, to_timestamp($7 / 1000.0), to_timestamp($8 / 1000.0))
      ON CONFLICT (delivery_spec_id) DO UPDATE
      SET
        audience_selector_id = EXCLUDED.audience_selector_id,
        review_required = EXCLUDED.review_required,
        delivery_mode = EXCLUDED.delivery_mode,
        status = EXCLUDED.status,
        config_json = EXCLUDED.config_json,
        updated_at = EXCLUDED.updated_at
    `, [
      record.deliverySpecId,
      record.audienceSelectorId,
      record.reviewRequired,
      record.deliveryMode,
      record.status,
      record.configJson ? JSON.stringify(record.configJson) : null,
      record.createdAt,
      record.updatedAt,
    ]);
  }

  private async upsertDeliveryTarget(client: PoolClient, record: DeliveryTargetRecord): Promise<void> {
    await client.query(`
      INSERT INTO delivery_targets (
        delivery_target_id,
        run_id,
        delivery_spec_id,
        target_actor_id,
        status,
        payload_json,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, to_timestamp($7 / 1000.0), to_timestamp($8 / 1000.0))
      ON CONFLICT (delivery_target_id) DO UPDATE
      SET
        target_actor_id = EXCLUDED.target_actor_id,
        status = EXCLUDED.status,
        payload_json = EXCLUDED.payload_json,
        updated_at = EXCLUDED.updated_at
    `, [
      record.deliveryTargetId,
      record.runId,
      record.deliverySpecId,
      record.targetActorId ?? null,
      record.status,
      record.payloadJson ? JSON.stringify(record.payloadJson) : null,
      record.createdAt,
      record.updatedAt,
    ]);
  }
}

export function createRuntimeRepository(databaseUrlOrPool: string | Pool | undefined): RuntimeRepository | undefined {
  if (!databaseUrlOrPool) return undefined;
  return new PgRuntimeRepository(databaseUrlOrPool);
}
