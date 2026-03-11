import { Pool, type PoolClient } from 'pg';

import type {
  DraftRevisionRecord,
  RecipeDraftRecord,
  WorkflowDraftSpec,
  WorkflowDraftRecord,
  WorkflowDraftSessionLinkRecord,
  WorkflowTemplateRecord,
  WorkflowTemplateVersionRecord,
} from '@baseinterface/workflow-contracts';

const EMPTY_DRAFT_SPEC: WorkflowDraftSpec = {
  schemaVersion: 'v1',
};

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

function extractSourceArtifactId(sourceRefs: Array<Record<string, unknown>>): string | undefined {
  for (const sourceRef of sourceRefs) {
    if (sourceRef.type === 'source_artifact' && typeof sourceRef.artifactId === 'string' && sourceRef.artifactId) {
      return sourceRef.artifactId;
    }
  }
  return undefined;
}

function toWorkflowTemplateRecord(row: Record<string, unknown>): WorkflowTemplateRecord {
  return {
    workflowId: String(row.workflow_id),
    workflowKey: String(row.workflow_key),
    name: String(row.name),
    compatProviderId: String(row.compat_provider_id),
    status: row.status === 'archived' ? 'archived' : 'active',
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toWorkflowTemplateVersionRecord(row: Record<string, unknown>): WorkflowTemplateVersionRecord {
  return {
    templateVersionId: String(row.template_version_id),
    workflowId: String(row.template_id),
    workflowKey: String(row.workflow_key),
    version: Number(row.version),
    status: row.status === 'archived' ? 'archived' : row.status === 'superseded' ? 'superseded' : 'published',
    spec: parseJson(row.spec_json, {}),
    createdAt: toMs(row.created_at),
  } as WorkflowTemplateVersionRecord;
}

function toWorkflowDraftRecord(row: Record<string, unknown>): WorkflowDraftRecord {
  return {
    draftId: String(row.draft_id),
    workflowKey: row.workflow_key ? String(row.workflow_key) : undefined,
    name: row.name ? String(row.name) : undefined,
    status: String(row.status) as WorkflowDraftRecord['status'],
    basedOnTemplateVersionId: row.based_on_template_version_id ? String(row.based_on_template_version_id) : undefined,
    publishedTemplateVersionId: row.published_template_version_id ? String(row.published_template_version_id) : undefined,
    currentSpec: parseJson(row.current_spec_json, EMPTY_DRAFT_SPEC),
    latestValidationSummary: parseJson(row.latest_validation_summary_json, undefined),
    publishable: Boolean(row.publishable),
    activeRevisionNumber: Number(row.active_revision_number || 0),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

function toDraftRevisionRecord(row: Record<string, unknown>): DraftRevisionRecord {
  return {
    revisionId: String(row.revision_id),
    draftId: String(row.draft_id),
    revisionNumber: Number(row.revision_number),
    source: String(row.source) as DraftRevisionRecord['source'],
    actorId: String(row.actor_id),
    changeSummary: String(row.change_summary),
    specSnapshot: parseJson(row.spec_snapshot_json, EMPTY_DRAFT_SPEC),
    validationSummary: parseJson(row.validation_summary_json, undefined),
    createdAt: toMs(row.created_at),
  };
}

function toWorkflowDraftSessionLinkRecord(row: Record<string, unknown>): WorkflowDraftSessionLinkRecord {
  return {
    sessionId: String(row.session_id),
    draftId: String(row.draft_id),
    userId: String(row.user_id),
    isActive: Boolean(row.is_active),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
    lastFocusedAt: row.last_focused_at ? toMs(row.last_focused_at) : undefined,
  };
}

function toRecipeDraftRecord(row: Record<string, unknown>): RecipeDraftRecord {
  const sourceRefs = parseJson<Array<Record<string, unknown>>>(row.source_refs_json, []);
  return {
    recipeDraftId: String(row.recipe_draft_id),
    title: row.title ? String(row.title) : undefined,
    status: String(row.status) as RecipeDraftRecord['status'],
    sourceArtifactId: row.source_artifact_id ? String(row.source_artifact_id) : extractSourceArtifactId(sourceRefs),
    sourceRefs,
    normalizedSteps: parseJson(row.normalized_steps_json, []),
    assumptions: parseJson(row.assumptions_json, []),
    reviewerNotes: parseJson(row.reviewer_notes_json, []),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
  };
}

export type WorkflowDetail = {
  workflow: WorkflowTemplateRecord;
  versions: WorkflowTemplateVersionRecord[];
};

export type SessionDraftList = {
  drafts: WorkflowDraftRecord[];
  sessionLinks: WorkflowDraftSessionLinkRecord[];
};

export type PlatformRepository = {
  close: () => Promise<void>;
  runInTransaction: <T>(callback: (repository: PlatformRepository) => Promise<T>) => Promise<T>;
  lockWorkflowKey: (workflowKey: string) => Promise<void>;
  lockSession: (sessionId: string) => Promise<void>;
  listWorkflows: () => Promise<WorkflowTemplateRecord[]>;
  getWorkflow: (workflowId: string) => Promise<WorkflowDetail | undefined>;
  getWorkflowByKey: (workflowKey: string) => Promise<WorkflowTemplateRecord | undefined>;
  getVersion: (templateVersionId: string) => Promise<WorkflowTemplateVersionRecord | undefined>;
  getLatestVersion: (workflowKey: string) => Promise<WorkflowTemplateVersionRecord | undefined>;
  createWorkflowTemplate: (record: WorkflowTemplateRecord) => Promise<WorkflowTemplateRecord>;
  updateWorkflowTemplate: (record: WorkflowTemplateRecord) => Promise<WorkflowTemplateRecord>;
  createWorkflowVersion: (record: WorkflowTemplateVersionRecord) => Promise<WorkflowTemplateVersionRecord>;
  supersedePublishedVersions: (workflowId: string) => Promise<void>;
  createDraft: (record: WorkflowDraftRecord) => Promise<WorkflowDraftRecord>;
  updateDraft: (record: WorkflowDraftRecord) => Promise<WorkflowDraftRecord>;
  getDraft: (draftId: string) => Promise<WorkflowDraftRecord | undefined>;
  listDrafts: () => Promise<WorkflowDraftRecord[]>;
  createDraftRevision: (record: DraftRevisionRecord) => Promise<DraftRevisionRecord>;
  listDraftRevisions: (draftId: string) => Promise<DraftRevisionRecord[]>;
  listDraftsBySession: (sessionId: string) => Promise<SessionDraftList>;
  listSessionLinks: (sessionId: string) => Promise<WorkflowDraftSessionLinkRecord[]>;
  getSessionLink: (sessionId: string, draftId: string) => Promise<WorkflowDraftSessionLinkRecord | undefined>;
  upsertSessionLink: (record: WorkflowDraftSessionLinkRecord) => Promise<WorkflowDraftSessionLinkRecord>;
  setActiveDraft: (sessionId: string, draftId: string, userId: string, timestamp: number) => Promise<WorkflowDraftSessionLinkRecord[]>;
  createRecipeDraft: (record: RecipeDraftRecord) => Promise<RecipeDraftRecord>;
  updateRecipeDraft: (record: RecipeDraftRecord) => Promise<RecipeDraftRecord>;
  upsertRunDerivedRecipeDraft: (record: RecipeDraftRecord) => Promise<RecipeDraftRecord>;
  getRecipeDraft: (recipeDraftId: string) => Promise<RecipeDraftRecord | undefined>;
  listRecipeDrafts: () => Promise<RecipeDraftRecord[]>;
};

export class MemoryPlatformRepository implements PlatformRepository {
  private readonly workflows = new Map<string, WorkflowTemplateRecord>();

  private readonly workflowIdsByKey = new Map<string, string>();

  private readonly versions = new Map<string, WorkflowTemplateVersionRecord>();

  private readonly versionsByWorkflowId = new Map<string, WorkflowTemplateVersionRecord[]>();

  private readonly drafts = new Map<string, WorkflowDraftRecord>();

  private readonly draftRevisions = new Map<string, DraftRevisionRecord[]>();

  private readonly sessionLinks = new Map<string, WorkflowDraftSessionLinkRecord>();

  private readonly recipeDrafts = new Map<string, RecipeDraftRecord>();

  async close(): Promise<void> {
    return;
  }

  async runInTransaction<T>(callback: (repository: PlatformRepository) => Promise<T>): Promise<T> {
    return await callback(this);
  }

  async lockWorkflowKey(_workflowKey: string): Promise<void> {
    return;
  }

  async lockSession(_sessionId: string): Promise<void> {
    return;
  }

  async listWorkflows(): Promise<WorkflowTemplateRecord[]> {
    return [...this.workflows.values()].sort((a, b) => a.workflowKey.localeCompare(b.workflowKey));
  }

  async getWorkflow(workflowId: string): Promise<WorkflowDetail | undefined> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return undefined;
    return {
      workflow,
      versions: [...(this.versionsByWorkflowId.get(workflowId) || [])].sort((a, b) => a.version - b.version),
    };
  }

  async getWorkflowByKey(workflowKey: string): Promise<WorkflowTemplateRecord | undefined> {
    const workflowId = this.workflowIdsByKey.get(workflowKey);
    return workflowId ? this.workflows.get(workflowId) : undefined;
  }

  async getVersion(templateVersionId: string): Promise<WorkflowTemplateVersionRecord | undefined> {
    return this.versions.get(templateVersionId);
  }

  async getLatestVersion(workflowKey: string): Promise<WorkflowTemplateVersionRecord | undefined> {
    const workflow = await this.getWorkflowByKey(workflowKey);
    if (!workflow) return undefined;
    const versions = this.versionsByWorkflowId.get(workflow.workflowId) || [];
    return versions[versions.length - 1];
  }

  async createWorkflowTemplate(record: WorkflowTemplateRecord): Promise<WorkflowTemplateRecord> {
    this.workflows.set(record.workflowId, record);
    this.workflowIdsByKey.set(record.workflowKey, record.workflowId);
    return record;
  }

  async updateWorkflowTemplate(record: WorkflowTemplateRecord): Promise<WorkflowTemplateRecord> {
    this.workflows.set(record.workflowId, record);
    this.workflowIdsByKey.set(record.workflowKey, record.workflowId);
    return record;
  }

  async createWorkflowVersion(record: WorkflowTemplateVersionRecord): Promise<WorkflowTemplateVersionRecord> {
    this.versions.set(record.templateVersionId, record);
    const versions = this.versionsByWorkflowId.get(record.workflowId) || [];
    const next = [...versions.filter((item) => item.templateVersionId !== record.templateVersionId), record]
      .sort((a, b) => a.version - b.version);
    this.versionsByWorkflowId.set(record.workflowId, next);
    return record;
  }

  async supersedePublishedVersions(workflowId: string): Promise<void> {
    const versions = this.versionsByWorkflowId.get(workflowId) || [];
    const next = versions.map((version) => {
      if (version.status !== 'published') return version;
      const updated = { ...version, status: 'superseded' as const };
      this.versions.set(updated.templateVersionId, updated);
      return updated;
    });
    this.versionsByWorkflowId.set(workflowId, next);
  }

  async createDraft(record: WorkflowDraftRecord): Promise<WorkflowDraftRecord> {
    this.drafts.set(record.draftId, record);
    return record;
  }

  async updateDraft(record: WorkflowDraftRecord): Promise<WorkflowDraftRecord> {
    this.drafts.set(record.draftId, record);
    return record;
  }

  async getDraft(draftId: string): Promise<WorkflowDraftRecord | undefined> {
    return this.drafts.get(draftId);
  }

  async listDrafts(): Promise<WorkflowDraftRecord[]> {
    return [...this.drafts.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async createDraftRevision(record: DraftRevisionRecord): Promise<DraftRevisionRecord> {
    const revisions = this.draftRevisions.get(record.draftId) || [];
    this.draftRevisions.set(record.draftId, [...revisions, record].sort((a, b) => a.revisionNumber - b.revisionNumber));
    return record;
  }

  async listDraftRevisions(draftId: string): Promise<DraftRevisionRecord[]> {
    return [...(this.draftRevisions.get(draftId) || [])].sort((a, b) => a.revisionNumber - b.revisionNumber);
  }

  async listSessionLinks(sessionId: string): Promise<WorkflowDraftSessionLinkRecord[]> {
    return [...this.sessionLinks.values()]
      .filter((record) => record.sessionId === sessionId)
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.updatedAt - a.updatedAt);
  }

  async listDraftsBySession(sessionId: string): Promise<SessionDraftList> {
    const sessionLinks = await this.listSessionLinks(sessionId);
    const drafts = sessionLinks
      .map((link) => this.drafts.get(link.draftId))
      .filter((draft): draft is WorkflowDraftRecord => Boolean(draft))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return { drafts, sessionLinks };
  }

  async getSessionLink(sessionId: string, draftId: string): Promise<WorkflowDraftSessionLinkRecord | undefined> {
    return this.sessionLinks.get(`${sessionId}:${draftId}`);
  }

  async upsertSessionLink(record: WorkflowDraftSessionLinkRecord): Promise<WorkflowDraftSessionLinkRecord> {
    this.sessionLinks.set(`${record.sessionId}:${record.draftId}`, record);
    return record;
  }

  async setActiveDraft(sessionId: string, draftId: string, userId: string, timestamp: number): Promise<WorkflowDraftSessionLinkRecord[]> {
    const sessionLinks = await this.listSessionLinks(sessionId);
    for (const link of sessionLinks) {
      this.sessionLinks.set(`${link.sessionId}:${link.draftId}`, {
        ...link,
        isActive: link.draftId === draftId,
        userId: link.draftId === draftId ? userId : link.userId,
        updatedAt: timestamp,
        lastFocusedAt: link.draftId === draftId ? timestamp : link.lastFocusedAt,
      });
    }

    const existing = this.sessionLinks.get(`${sessionId}:${draftId}`);
    if (!existing) {
      this.sessionLinks.set(`${sessionId}:${draftId}`, {
        sessionId,
        draftId,
        userId,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastFocusedAt: timestamp,
      });
    }

    return await this.listSessionLinks(sessionId);
  }

  async createRecipeDraft(record: RecipeDraftRecord): Promise<RecipeDraftRecord> {
    const next = {
      ...record,
      sourceArtifactId: record.sourceArtifactId || extractSourceArtifactId(record.sourceRefs),
    };
    this.recipeDrafts.set(next.recipeDraftId, next);
    return next;
  }

  async updateRecipeDraft(record: RecipeDraftRecord): Promise<RecipeDraftRecord> {
    const next = {
      ...record,
      sourceArtifactId: record.sourceArtifactId || extractSourceArtifactId(record.sourceRefs),
    };
    this.recipeDrafts.set(next.recipeDraftId, next);
    return next;
  }

  async upsertRunDerivedRecipeDraft(record: RecipeDraftRecord): Promise<RecipeDraftRecord> {
    const normalizedSourceArtifactId = record.sourceArtifactId || extractSourceArtifactId(record.sourceRefs);
    const existing = [...this.recipeDrafts.values()].find((draft) => (
      draft.sourceArtifactId
      && normalizedSourceArtifactId
      && draft.sourceArtifactId === normalizedSourceArtifactId
    ));
    if (!existing) {
      const next = {
        ...record,
        sourceArtifactId: normalizedSourceArtifactId,
      };
      this.recipeDrafts.set(next.recipeDraftId, next);
      return next;
    }

    const next: RecipeDraftRecord = {
      ...existing,
      ...record,
      recipeDraftId: existing.recipeDraftId,
      sourceArtifactId: existing.sourceArtifactId || normalizedSourceArtifactId,
      status: existing.status,
      createdAt: existing.createdAt,
    };
    this.recipeDrafts.set(existing.recipeDraftId, next);
    return next;
  }

  async getRecipeDraft(recipeDraftId: string): Promise<RecipeDraftRecord | undefined> {
    return this.recipeDrafts.get(recipeDraftId);
  }

  async listRecipeDrafts(): Promise<RecipeDraftRecord[]> {
    return [...this.recipeDrafts.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

export class PostgresPlatformRepository implements PlatformRepository {
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

  async runInTransaction<T>(callback: (repository: PlatformRepository) => Promise<T>): Promise<T> {
    if (this.client) {
      return await callback(this);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txRepository = new PostgresPlatformRepository(this.pool, client);
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

  async lockWorkflowKey(workflowKey: string): Promise<void> {
    await this.queryable.query('SELECT pg_advisory_xact_lock(hashtext($1))', [workflowKey]);
  }

  async lockSession(sessionId: string): Promise<void> {
    await this.queryable.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`builder-session:${sessionId}`]);
  }

  async listWorkflows(): Promise<WorkflowTemplateRecord[]> {
    const result = await this.queryable.query(`
      SELECT workflow_id, workflow_key, name, compat_provider_id, status, created_at, updated_at
      FROM workflow_templates
      ORDER BY workflow_key ASC
    `);
    return result.rows.map((row) => toWorkflowTemplateRecord(row));
  }

  async getWorkflow(workflowId: string): Promise<WorkflowDetail | undefined> {
    const workflowResult = await this.queryable.query(`
      SELECT workflow_id, workflow_key, name, compat_provider_id, status, created_at, updated_at
      FROM workflow_templates
      WHERE workflow_id = $1
    `, [workflowId]);
    const workflowRow = workflowResult.rows[0];
    if (!workflowRow) return undefined;

    const versionResult = await this.queryable.query(`
      SELECT v.template_version_id, v.template_id, t.workflow_key, v.version, v.status, v.spec_json, v.created_at
      FROM workflow_template_versions v
      JOIN workflow_templates t ON t.workflow_id = v.template_id
      WHERE v.template_id = $1
      ORDER BY v.version ASC
    `, [workflowId]);

    return {
      workflow: toWorkflowTemplateRecord(workflowRow),
      versions: versionResult.rows.map((row) => toWorkflowTemplateVersionRecord(row)),
    };
  }

  async getWorkflowByKey(workflowKey: string): Promise<WorkflowTemplateRecord | undefined> {
    const result = await this.queryable.query(`
      SELECT workflow_id, workflow_key, name, compat_provider_id, status, created_at, updated_at
      FROM workflow_templates
      WHERE workflow_key = $1
    `, [workflowKey]);
    return result.rows[0] ? toWorkflowTemplateRecord(result.rows[0]) : undefined;
  }

  async getVersion(templateVersionId: string): Promise<WorkflowTemplateVersionRecord | undefined> {
    const result = await this.queryable.query(`
      SELECT v.template_version_id, v.template_id, t.workflow_key, v.version, v.status, v.spec_json, v.created_at
      FROM workflow_template_versions v
      JOIN workflow_templates t ON t.workflow_id = v.template_id
      WHERE v.template_version_id = $1
    `, [templateVersionId]);
    return result.rows[0] ? toWorkflowTemplateVersionRecord(result.rows[0]) : undefined;
  }

  async getLatestVersion(workflowKey: string): Promise<WorkflowTemplateVersionRecord | undefined> {
    const result = await this.queryable.query(`
      SELECT v.template_version_id, v.template_id, t.workflow_key, v.version, v.status, v.spec_json, v.created_at
      FROM workflow_template_versions v
      JOIN workflow_templates t ON t.workflow_id = v.template_id
      WHERE t.workflow_key = $1
      ORDER BY v.version DESC
      LIMIT 1
    `, [workflowKey]);
    return result.rows[0] ? toWorkflowTemplateVersionRecord(result.rows[0]) : undefined;
  }

  async createWorkflowTemplate(record: WorkflowTemplateRecord): Promise<WorkflowTemplateRecord> {
    const result = await this.queryable.query(`
      INSERT INTO workflow_templates (
        workflow_id,
        workflow_key,
        name,
        compat_provider_id,
        status,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), to_timestamp($7 / 1000.0))
      RETURNING workflow_id, workflow_key, name, compat_provider_id, status, created_at, updated_at
    `, [
      record.workflowId,
      record.workflowKey,
      record.name,
      record.compatProviderId,
      record.status,
      record.createdAt,
      record.updatedAt,
    ]);
    return toWorkflowTemplateRecord(result.rows[0]);
  }

  async updateWorkflowTemplate(record: WorkflowTemplateRecord): Promise<WorkflowTemplateRecord> {
    const result = await this.queryable.query(`
      UPDATE workflow_templates
      SET workflow_key = $2,
          name = $3,
          compat_provider_id = $4,
          status = $5,
          updated_at = to_timestamp($6 / 1000.0)
      WHERE workflow_id = $1
      RETURNING workflow_id, workflow_key, name, compat_provider_id, status, created_at, updated_at
    `, [
      record.workflowId,
      record.workflowKey,
      record.name,
      record.compatProviderId,
      record.status,
      record.updatedAt,
    ]);
    return toWorkflowTemplateRecord(result.rows[0]);
  }

  async createWorkflowVersion(record: WorkflowTemplateVersionRecord): Promise<WorkflowTemplateVersionRecord> {
    const result = await this.queryable.query(`
      INSERT INTO workflow_template_versions (
        template_version_id,
        template_id,
        version,
        status,
        spec_json,
        created_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, to_timestamp($6 / 1000.0))
      RETURNING template_version_id, template_id, version, status, spec_json, created_at
    `, [
      record.templateVersionId,
      record.workflowId,
      record.version,
      record.status,
      JSON.stringify(record.spec),
      record.createdAt,
    ]);
    return {
      ...toWorkflowTemplateVersionRecord({
        ...result.rows[0],
        workflow_key: record.workflowKey,
      }),
      workflowKey: record.workflowKey,
    };
  }

  async supersedePublishedVersions(workflowId: string): Promise<void> {
    await this.queryable.query(`
      UPDATE workflow_template_versions
      SET status = 'superseded'
      WHERE template_id = $1
        AND status = 'published'
    `, [workflowId]);
  }

  async createDraft(record: WorkflowDraftRecord): Promise<WorkflowDraftRecord> {
    const result = await this.queryable.query(`
      INSERT INTO workflow_drafts (
        draft_id,
        workflow_key,
        name,
        status,
        based_on_template_version_id,
        published_template_version_id,
        current_spec_json,
        latest_validation_summary_json,
        publishable,
        active_revision_number,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10,
        to_timestamp($11 / 1000.0), to_timestamp($12 / 1000.0)
      )
      RETURNING *
    `, [
      record.draftId,
      record.workflowKey || null,
      record.name || null,
      record.status,
      record.basedOnTemplateVersionId || null,
      record.publishedTemplateVersionId || null,
      JSON.stringify(record.currentSpec),
      record.latestValidationSummary ? JSON.stringify(record.latestValidationSummary) : null,
      record.publishable,
      record.activeRevisionNumber,
      record.createdAt,
      record.updatedAt,
    ]);
    return toWorkflowDraftRecord(result.rows[0]);
  }

  async updateDraft(record: WorkflowDraftRecord): Promise<WorkflowDraftRecord> {
    const result = await this.queryable.query(`
      UPDATE workflow_drafts
      SET workflow_key = $2,
          name = $3,
          status = $4,
          based_on_template_version_id = $5,
          published_template_version_id = $6,
          current_spec_json = $7::jsonb,
          latest_validation_summary_json = $8::jsonb,
          publishable = $9,
          active_revision_number = $10,
          updated_at = to_timestamp($11 / 1000.0)
      WHERE draft_id = $1
      RETURNING *
    `, [
      record.draftId,
      record.workflowKey || null,
      record.name || null,
      record.status,
      record.basedOnTemplateVersionId || null,
      record.publishedTemplateVersionId || null,
      JSON.stringify(record.currentSpec),
      record.latestValidationSummary ? JSON.stringify(record.latestValidationSummary) : null,
      record.publishable,
      record.activeRevisionNumber,
      record.updatedAt,
    ]);
    return toWorkflowDraftRecord(result.rows[0]);
  }

  async getDraft(draftId: string): Promise<WorkflowDraftRecord | undefined> {
    const result = await this.queryable.query(`SELECT * FROM workflow_drafts WHERE draft_id = $1`, [draftId]);
    return result.rows[0] ? toWorkflowDraftRecord(result.rows[0]) : undefined;
  }

  async listDrafts(): Promise<WorkflowDraftRecord[]> {
    const result = await this.queryable.query(`
      SELECT *
      FROM workflow_drafts
      ORDER BY updated_at DESC
    `);
    return result.rows.map((row) => toWorkflowDraftRecord(row));
  }

  async createDraftRevision(record: DraftRevisionRecord): Promise<DraftRevisionRecord> {
    const result = await this.queryable.query(`
      INSERT INTO draft_revisions (
        revision_id,
        draft_id,
        revision_number,
        source,
        actor_id,
        change_summary,
        spec_snapshot_json,
        validation_summary_json,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, to_timestamp($9 / 1000.0))
      RETURNING *
    `, [
      record.revisionId,
      record.draftId,
      record.revisionNumber,
      record.source,
      record.actorId,
      record.changeSummary,
      JSON.stringify(record.specSnapshot),
      record.validationSummary ? JSON.stringify(record.validationSummary) : null,
      record.createdAt,
    ]);
    return toDraftRevisionRecord(result.rows[0]);
  }

  async listDraftRevisions(draftId: string): Promise<DraftRevisionRecord[]> {
    const result = await this.queryable.query(`
      SELECT *
      FROM draft_revisions
      WHERE draft_id = $1
      ORDER BY revision_number ASC
    `, [draftId]);
    return result.rows.map((row) => toDraftRevisionRecord(row));
  }

  async listSessionLinks(sessionId: string): Promise<WorkflowDraftSessionLinkRecord[]> {
    const result = await this.queryable.query(`
      SELECT *
      FROM workflow_draft_session_links
      WHERE session_id = $1
      ORDER BY is_active DESC, updated_at DESC
    `, [sessionId]);
    return result.rows.map((row) => toWorkflowDraftSessionLinkRecord(row));
  }

  async listDraftsBySession(sessionId: string): Promise<SessionDraftList> {
    const sessionLinks = await this.listSessionLinks(sessionId);
    if (sessionLinks.length === 0) {
      return { drafts: [], sessionLinks: [] };
    }
    const draftIds = sessionLinks.map((link) => link.draftId);
    const result = await this.queryable.query(`
      SELECT *
      FROM workflow_drafts
      WHERE draft_id = ANY($1::text[])
      ORDER BY updated_at DESC
    `, [draftIds]);
    const draftMap = new Map(result.rows.map((row) => {
      const draft = toWorkflowDraftRecord(row);
      return [draft.draftId, draft] as const;
    }));
    return {
      drafts: sessionLinks
        .map((link) => draftMap.get(link.draftId))
        .filter((draft): draft is WorkflowDraftRecord => Boolean(draft)),
      sessionLinks,
    };
  }

  async getSessionLink(sessionId: string, draftId: string): Promise<WorkflowDraftSessionLinkRecord | undefined> {
    const result = await this.queryable.query(`
      SELECT *
      FROM workflow_draft_session_links
      WHERE session_id = $1
        AND draft_id = $2
    `, [sessionId, draftId]);
    return result.rows[0] ? toWorkflowDraftSessionLinkRecord(result.rows[0]) : undefined;
  }

  async upsertSessionLink(record: WorkflowDraftSessionLinkRecord): Promise<WorkflowDraftSessionLinkRecord> {
    const result = await this.queryable.query(`
      INSERT INTO workflow_draft_session_links (
        session_id,
        draft_id,
        user_id,
        is_active,
        last_focused_at,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, to_timestamp($5 / 1000.0), to_timestamp($6 / 1000.0), to_timestamp($7 / 1000.0)
      )
      ON CONFLICT (session_id, draft_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        is_active = EXCLUDED.is_active,
        last_focused_at = EXCLUDED.last_focused_at,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [
      record.sessionId,
      record.draftId,
      record.userId,
      record.isActive,
      record.lastFocusedAt || record.updatedAt,
      record.createdAt,
      record.updatedAt,
    ]);
    return toWorkflowDraftSessionLinkRecord(result.rows[0]);
  }

  async setActiveDraft(sessionId: string, draftId: string, userId: string, timestamp: number): Promise<WorkflowDraftSessionLinkRecord[]> {
    if (this.client) {
      return await this.setActiveDraftWithClient(this.client, sessionId, draftId, userId, timestamp);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.setActiveDraftWithClient(client, sessionId, draftId, userId, timestamp);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async setActiveDraftWithClient(
    client: PoolClient,
    sessionId: string,
    draftId: string,
    userId: string,
    timestamp: number,
  ): Promise<WorkflowDraftSessionLinkRecord[]> {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`builder-session:${sessionId}`]);
    await client.query(`
      UPDATE workflow_draft_session_links
      SET is_active = false,
          updated_at = to_timestamp($2 / 1000.0)
      WHERE session_id = $1
    `, [sessionId, timestamp]);

    await this.upsertSessionLinkWithClient(client, {
      sessionId,
      draftId,
      userId,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastFocusedAt: timestamp,
    });

    const result = await client.query(`
      SELECT *
      FROM workflow_draft_session_links
      WHERE session_id = $1
      ORDER BY is_active DESC, updated_at DESC
    `, [sessionId]);
    return result.rows.map((row) => toWorkflowDraftSessionLinkRecord(row));
  }

  private async upsertSessionLinkWithClient(client: PoolClient, record: WorkflowDraftSessionLinkRecord): Promise<void> {
    await client.query(`
      INSERT INTO workflow_draft_session_links (
        session_id,
        draft_id,
        user_id,
        is_active,
        last_focused_at,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, to_timestamp($5 / 1000.0), to_timestamp($6 / 1000.0), to_timestamp($7 / 1000.0)
      )
      ON CONFLICT (session_id, draft_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        is_active = EXCLUDED.is_active,
        last_focused_at = EXCLUDED.last_focused_at,
        updated_at = EXCLUDED.updated_at
    `, [
      record.sessionId,
      record.draftId,
      record.userId,
      record.isActive,
      record.lastFocusedAt || record.updatedAt,
      record.createdAt,
      record.updatedAt,
    ]);
  }

  async createRecipeDraft(record: RecipeDraftRecord): Promise<RecipeDraftRecord> {
    const sourceArtifactId = record.sourceArtifactId || extractSourceArtifactId(record.sourceRefs);
    const result = await this.queryable.query(`
      INSERT INTO recipe_drafts (
        recipe_draft_id,
        title,
        status,
        source_artifact_id,
        source_refs_json,
        normalized_steps_json,
        assumptions_json,
        reviewer_notes_json,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, to_timestamp($9 / 1000.0), to_timestamp($10 / 1000.0))
      RETURNING *
    `, [
      record.recipeDraftId,
      record.title || null,
      record.status,
      sourceArtifactId || null,
      JSON.stringify(record.sourceRefs),
      JSON.stringify(record.normalizedSteps),
      JSON.stringify(record.assumptions),
      JSON.stringify(record.reviewerNotes),
      record.createdAt,
      record.updatedAt,
    ]);
    return toRecipeDraftRecord(result.rows[0]);
  }

  async updateRecipeDraft(record: RecipeDraftRecord): Promise<RecipeDraftRecord> {
    const sourceArtifactId = record.sourceArtifactId || extractSourceArtifactId(record.sourceRefs);
    const result = await this.queryable.query(`
      UPDATE recipe_drafts
      SET title = $2,
          status = $3,
          source_artifact_id = $4,
          source_refs_json = $5::jsonb,
          normalized_steps_json = $6::jsonb,
          assumptions_json = $7::jsonb,
          reviewer_notes_json = $8::jsonb,
          updated_at = to_timestamp($9 / 1000.0)
      WHERE recipe_draft_id = $1
      RETURNING *
    `, [
      record.recipeDraftId,
      record.title || null,
      record.status,
      sourceArtifactId || null,
      JSON.stringify(record.sourceRefs),
      JSON.stringify(record.normalizedSteps),
      JSON.stringify(record.assumptions),
      JSON.stringify(record.reviewerNotes),
      record.updatedAt,
    ]);
    return toRecipeDraftRecord(result.rows[0]);
  }

  async upsertRunDerivedRecipeDraft(record: RecipeDraftRecord): Promise<RecipeDraftRecord> {
    const sourceArtifactId = record.sourceArtifactId || extractSourceArtifactId(record.sourceRefs);
    const result = await this.queryable.query(`
      INSERT INTO recipe_drafts (
        recipe_draft_id,
        title,
        status,
        source_artifact_id,
        source_refs_json,
        normalized_steps_json,
        assumptions_json,
        reviewer_notes_json,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, to_timestamp($9 / 1000.0), to_timestamp($10 / 1000.0))
      ON CONFLICT (source_artifact_id) DO UPDATE
      SET title = EXCLUDED.title,
          status = recipe_drafts.status,
          source_refs_json = EXCLUDED.source_refs_json,
          normalized_steps_json = EXCLUDED.normalized_steps_json,
          assumptions_json = EXCLUDED.assumptions_json,
          reviewer_notes_json = EXCLUDED.reviewer_notes_json,
          updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [
      record.recipeDraftId,
      record.title || null,
      record.status,
      sourceArtifactId || null,
      JSON.stringify(record.sourceRefs),
      JSON.stringify(record.normalizedSteps),
      JSON.stringify(record.assumptions),
      JSON.stringify(record.reviewerNotes),
      record.createdAt,
      record.updatedAt,
    ]);
    return toRecipeDraftRecord(result.rows[0]);
  }

  async getRecipeDraft(recipeDraftId: string): Promise<RecipeDraftRecord | undefined> {
    const result = await this.queryable.query(`
      SELECT *
      FROM recipe_drafts
      WHERE recipe_draft_id = $1
    `, [recipeDraftId]);
    return result.rows[0] ? toRecipeDraftRecord(result.rows[0]) : undefined;
  }

  async listRecipeDrafts(): Promise<RecipeDraftRecord[]> {
    const result = await this.queryable.query(`
      SELECT *
      FROM recipe_drafts
      ORDER BY updated_at DESC
    `);
    return result.rows.map((row) => toRecipeDraftRecord(row));
  }
}

export function createPlatformRepository(databaseUrl?: string): PlatformRepository {
  if (!databaseUrl) {
    return new MemoryPlatformRepository();
  }
  return new PostgresPlatformRepository(databaseUrl);
}
