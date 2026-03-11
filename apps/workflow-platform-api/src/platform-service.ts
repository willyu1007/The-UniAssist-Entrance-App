import type {
  DraftRevisionRecord,
  DraftSource,
  DraftValidationSummary,
  RecipeDraftCreateRequest,
  RecipeDraftRecord,
  RecipeDraftStatus,
  RecipeDraftUpdateRequest,
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
  WorkflowDraftSpec,
  WorkflowDraftStatus,
  WorkflowArtifactDetailResponse,
  WorkflowArtifactRecord,
  WorkflowCommandResponse,
  WorkflowResumeRequest,
  WorkflowRunQueryResponse,
  WorkflowRunSnapshot,
  WorkflowRuntimeResumeRunRequest,
  WorkflowRuntimeStartRunRequest,
  WorkflowStartRequest,
  WorkflowTemplateRecord,
  WorkflowTemplateSpec,
  WorkflowTemplateVersionRecord,
} from '@baseinterface/workflow-contracts';
import { isWorkflowDraftTerminal } from '@baseinterface/workflow-contracts';
import type { RuntimeClient } from './runtime-client';
import { PlatformError } from './platform-errors';
import type { PlatformRepository, WorkflowDetail } from './platform-repository';

type PlatformServiceDeps = {
  repository: PlatformRepository;
  runtimeClient: RuntimeClient;
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

  private readonly runtimeClient: RuntimeClient;

  private readonly now: () => number;

  private readonly uuid: () => string;

  constructor(deps: PlatformServiceDeps) {
    this.repository = deps.repository;
    this.runtimeClient = deps.runtimeClient;
    this.now = deps.now;
    this.uuid = deps.uuid;
  }

  async close(): Promise<void> {
    await this.repository.close();
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

  async listApprovals(): Promise<Record<string, unknown>> {
    return await this.runtimeClient.listApprovals();
  }

  async getArtifact(artifactId: string): Promise<WorkflowArtifactDetailResponse> {
    return await this.runtimeClient.getArtifact(artifactId);
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
        throw new PlatformError(404, 'DRAFT_NOT_IN_SESSION', 'draft is not linked to the session');
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
