import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import express from 'express';

import type {
  InteractionEvent,
  ProviderInteractRequest,
  ProviderInteractResponse,
  ProviderInvokeRequest,
  ProviderInvokeResponse,
  TaskQuestionExtensionEvent,
  TaskStateExtensionEvent,
} from '@baseinterface/contracts';
import {
  createLogger,
  createMemoryNonceStore,
  loadInternalAuthConfigFromEnv,
  verifyInternalAuthRequest,
} from '@baseinterface/shared';
import type {
  WorkflowCompatCompletionMetadata,
  WorkflowCompatContextEnvelope,
  ValidationReportPayload,
} from '@baseinterface/workflow-contracts';
import type {
  AnalysisRecipeCandidatePayload,
  AssessmentDraftPayload,
  ChangeIntentPayload,
  DeliverySummaryPayload,
  EvidencePackPayload,
  ExecutionPlanPayload,
  ObservationArtifactPayload,
  ReviewableDeliveryPayload,
} from '@baseinterface/workflow-contracts/scenario-samples';

const PORT = Number(process.env.PORT || 8890);
const PROVIDER_ID = 'sample';
const INTERNAL_AUTH_DEFAULT_SERVICE_ID = 'provider-sample';
const INTERNAL_AUTH_CONFIG = (() => {
  const config = loadInternalAuthConfigFromEnv(process.env);
  if (config.serviceId === 'unknown') {
    config.serviceId = INTERNAL_AUTH_DEFAULT_SERVICE_ID;
  }
  return config;
})();
const logger = createLogger({ service: 'provider-sample' });
const internalNonceStore = createMemoryNonceStore();

type RawBodyRequest = Request & { rawBody?: string };

type InternalAuthOptions = {
  endpoint: string;
  requiredScopes: string[];
  traceId?: string;
};

type SampleTaskMemory = {
  subject?: string;
  inputSummary?: string;
};

type SampleSubject = {
  subjectRef: string;
  subjectType: string;
  displayName: string;
};

type SampleReviewerActor = {
  actorId: string;
  displayName: string;
};

type SampleAudience = {
  audienceType: string;
  actorId: string;
  displayName: string;
  actorType: 'person' | 'external_contact' | 'cohort';
};

type SampleRequester = {
  actorId: string;
  displayName: string;
  team?: string;
};

type SampleChangeTargets = {
  issueRef: string;
  changeReviewRef: string;
  pipelineRef: string;
};

const sampleTaskMemory = new Map<string, SampleTaskMemory>();

const SUBJECT_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string', title: '样例主题' },
  },
  required: ['text'],
};

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    inputSummary: { type: 'string', title: '输入摘要' },
  },
  required: ['inputSummary'],
};

const SUBJECT_UI_SCHEMA = {
  order: ['text'],
};

const SUMMARY_UI_SCHEMA = {
  order: ['inputSummary'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Array.isArray(value) === false;
}

function buildAuthError(
  status: 401 | 403,
  code: string,
  detail: string,
  traceId?: string,
): Record<string, unknown> {
  return {
    schemaVersion: 'v0',
    type: status === 403 ? 'https://uniassist/errors/forbidden' : 'https://uniassist/errors/unauthorized',
    title: status === 403 ? 'Forbidden' : 'Unauthorized',
    status,
    code,
    detail,
    traceId,
  };
}

async function guardInternalAuth(
  req: RawBodyRequest,
  res: Response,
  options: InternalAuthOptions,
): Promise<boolean> {
  if (INTERNAL_AUTH_CONFIG.mode === 'off') return true;

  const verification = await verifyInternalAuthRequest({
    method: req.method,
    path: req.path,
    rawBody: req.rawBody || '',
    headers: req.headers as Record<string, string | string[] | undefined>,
    config: INTERNAL_AUTH_CONFIG,
    nonceStore: internalNonceStore,
    expectedAudience: INTERNAL_AUTH_CONFIG.serviceId,
    requiredScopes: options.requiredScopes,
    allowedSubjects: ['gateway', 'workflow-runtime'],
  });

  if (verification.ok) return true;

  logger.warn('internal auth denied', {
    endpoint: options.endpoint,
    mode: INTERNAL_AUTH_CONFIG.mode,
    code: verification.code,
    detail: verification.message,
    traceId: options.traceId,
    subject: verification.claims?.sub,
    audience: verification.claims?.aud,
    requiredScopes: options.requiredScopes,
  });

  if (INTERNAL_AUTH_CONFIG.mode === 'audit') return true;

  res.status(verification.status).json(
    buildAuthError(verification.status, verification.code, verification.message, options.traceId),
  );
  return false;
}

function buildTaskQuestion(
  runId: string,
  taskId: string,
  questionId: string,
  prompt: string,
  answerSchema: Record<string, unknown>,
  uiSchema: Record<string, unknown>,
): TaskQuestionExtensionEvent {
  return {
    type: 'provider_extension',
    extensionKind: 'task_question',
    payload: {
      schemaVersion: 'v0',
      providerId: PROVIDER_ID,
      runId,
      taskId,
      questionId,
      replyToken: crypto.randomUUID(),
      prompt,
      answerSchema,
      uiSchema,
    },
  };
}

function buildTaskState(
  runId: string,
  taskId: string,
  state: TaskStateExtensionEvent['payload']['state'],
  executionPolicy: TaskStateExtensionEvent['payload']['executionPolicy'],
  metadata?: Record<string, unknown>,
): TaskStateExtensionEvent {
  return {
    type: 'provider_extension',
    extensionKind: 'task_state',
    payload: {
      schemaVersion: 'v0',
      providerId: PROVIDER_ID,
      runId,
      taskId,
      state,
      executionPolicy,
      metadata,
    },
  };
}

function normalizeTaskId(body: ProviderInteractRequest): string {
  return body.interaction.inReplyTo?.taskId || body.interaction.runId;
}

function extractSubjectText(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) return undefined;
  if (typeof payload.text === 'string' && payload.text.trim()) return payload.text.trim();
  if (typeof payload.subject === 'string' && payload.subject.trim()) return payload.subject.trim();
  return undefined;
}

function extractInputSummary(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) return undefined;
  if (typeof payload.inputSummary === 'string' && payload.inputSummary.trim()) {
    return payload.inputSummary.trim();
  }
  if (typeof payload.materialsSummary === 'string' && payload.materialsSummary.trim()) {
    return payload.materialsSummary.trim();
  }
  if (Array.isArray(payload.inputs) && payload.inputs.length > 0) {
    return payload.inputs.map((item) => String(item)).join('；');
  }
  if (Array.isArray(payload.materials) && payload.materials.length > 0) {
    return payload.materials.map((item) => String(item)).join('；');
  }
  return undefined;
}

function getWorkflowEnvelope(value: unknown): WorkflowCompatContextEnvelope | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value.__workflow;
  if (!isRecord(candidate)) return undefined;
  if (typeof candidate.nodeKey !== 'string' || typeof candidate.nodeType !== 'string') return undefined;
  return {
    nodeKey: candidate.nodeKey,
    nodeType: candidate.nodeType as WorkflowCompatContextEnvelope['nodeType'],
    nodeConfig: isRecord(candidate.nodeConfig) ? candidate.nodeConfig : undefined,
    runInput: isRecord(candidate.runInput) ? candidate.runInput : undefined,
    upstreamArtifactRefs: Array.isArray(candidate.upstreamArtifactRefs)
      ? candidate.upstreamArtifactRefs.filter(isRecord).map((item) => ({
          artifactId: String(item.artifactId || ''),
          artifactType: String(item.artifactType || ''),
          state: String(item.state || 'validated') as WorkflowCompatContextEnvelope['upstreamArtifactRefs'][number]['state'],
        })).filter((item) => item.artifactId && item.artifactType)
      : [],
  };
}

function normalizeSubject(runInput: Record<string, unknown> | undefined, runId: string): SampleSubject {
  const subject = isRecord(runInput?.subject) ? runInput.subject : undefined;
  const subjectRef = typeof subject?.subjectRef === 'string' && subject.subjectRef
    ? subject.subjectRef
    : `subject:${runId}`;
  const subjectType = typeof subject?.subjectType === 'string' && subject.subjectType
      ? subject.subjectType
      : 'learner';
  const displayName = typeof subject?.displayName === 'string' && subject.displayName
    ? subject.displayName
    : typeof runInput?.subject === 'string' && runInput.subject
      ? runInput.subject
      : '示例主题';
  return {
    subjectRef,
    subjectType,
    displayName,
  };
}

function normalizeInputs(runInput: Record<string, unknown> | undefined): string[] {
  const rawItems = Array.isArray(runInput?.inputs) && runInput.inputs.length > 0
    ? runInput.inputs
    : Array.isArray(runInput?.materials) && runInput.materials.length > 0
      ? runInput.materials
      : undefined;
  if (!rawItems) {
    return ['需求摘要', '历史上下文'];
  }
  return rawItems.map((item, index) => {
    if (typeof item === 'string' && item.trim()) return item.trim();
    if (isRecord(item)) {
      if (typeof item.title === 'string' && item.title.trim()) return item.title.trim();
      if (typeof item.summary === 'string' && item.summary.trim()) return item.summary.trim();
    }
    return `输入 ${index + 1}`;
  });
}

function normalizeReviewerActor(runInput: Record<string, unknown> | undefined, runId: string): SampleReviewerActor {
  const reviewerActor = isRecord(runInput?.reviewerActor) ? runInput.reviewerActor : undefined;
  return {
    actorId: typeof reviewerActor?.actorId === 'string' && reviewerActor.actorId
      ? reviewerActor.actorId
      : `actor:${runId}:reviewer`,
    displayName: typeof reviewerActor?.displayName === 'string' && reviewerActor.displayName
      ? reviewerActor.displayName
      : 'Sample Reviewer',
  };
}

function normalizeAudiences(runInput: Record<string, unknown> | undefined, runId: string): SampleAudience[] {
  if (!Array.isArray(runInput?.audiences) || runInput.audiences.length === 0) {
    return [
      {
        audienceType: 'stakeholder',
        actorId: `actor:${runId}:stakeholder`,
        displayName: 'Stakeholder Sample Target',
        actorType: 'external_contact',
      },
      {
        audienceType: 'requester',
        actorId: `actor:${runId}:requester`,
        displayName: 'Requester Sample Target',
        actorType: 'person',
      },
    ];
  }

  return runInput.audiences
    .map((item, index): SampleAudience | undefined => {
      if (typeof item === 'string' && item.trim()) {
        const audienceType = item.trim();
        return {
          audienceType,
          actorId: `actor:${runId}:${audienceType}`,
          displayName: `${audienceType} 样例收件人`,
          actorType: audienceType === 'group' ? 'cohort' : 'person',
        };
      }
      if (!isRecord(item)) return undefined;
      const audienceType = typeof item.audienceType === 'string' && item.audienceType
        ? item.audienceType
        : `audience-${index + 1}`;
      return {
        audienceType,
        actorId: typeof item.actorId === 'string' && item.actorId ? item.actorId : `actor:${runId}:${audienceType}`,
        displayName: typeof item.displayName === 'string' && item.displayName
          ? item.displayName
          : `${audienceType} 样例收件人`,
        actorType: item.actorType === 'cohort' || item.actorType === 'external_contact'
          ? item.actorType
          : 'person',
      };
    })
    .filter((item): item is SampleAudience => Boolean(item));
}

function normalizeTemporaryCollaborators(runInput: Record<string, unknown> | undefined, runId: string) {
  if (!Array.isArray(runInput?.temporaryCollaborators)) return [];
  return runInput.temporaryCollaborators
    .map((item, index) => {
      if (!isRecord(item)) return undefined;
      return {
        actorId: typeof item.actorId === 'string' && item.actorId ? item.actorId : `actor:${runId}:temp:${index + 1}`,
        displayName: typeof item.displayName === 'string' && item.displayName ? item.displayName : `临时协作者 ${index + 1}`,
      };
    })
    .filter((item): item is { actorId: string; displayName: string } => Boolean(item));
}

function unwrapScenarioInput(runInput: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (isRecord(runInput?.input)) {
    return runInput.input;
  }
  return runInput;
}

function normalizeRequester(runInput: Record<string, unknown> | undefined, runId: string): SampleRequester {
  const scenarioInput = unwrapScenarioInput(runInput);
  const requester = isRecord(scenarioInput?.requester) ? scenarioInput.requester : undefined;
  return {
    actorId: typeof requester?.actorId === 'string' && requester.actorId ? requester.actorId : `actor:${runId}:requester`,
    displayName: typeof requester?.displayName === 'string' && requester.displayName ? requester.displayName : 'Sample Requester',
    team: typeof requester?.team === 'string' && requester.team ? requester.team : undefined,
  };
}

function normalizeChangeRef(runInput: Record<string, unknown> | undefined, runId: string): string {
  const scenarioInput = unwrapScenarioInput(runInput);
  if (typeof scenarioInput?.changeRef === 'string' && scenarioInput.changeRef) {
    return scenarioInput.changeRef;
  }
  return `change:${runId}`;
}

function normalizeTargetSystems(runInput: Record<string, unknown> | undefined): string[] {
  const scenarioInput = unwrapScenarioInput(runInput);
  if (!Array.isArray(scenarioInput?.targetSystems) || scenarioInput.targetSystems.length === 0) {
    return ['issue_tracker', 'source_control', 'ci_pipeline'];
  }
  return scenarioInput.targetSystems.map((item) => String(item)).filter(Boolean);
}

function normalizeConstraints(runInput: Record<string, unknown> | undefined): string[] {
  const scenarioInput = unwrapScenarioInput(runInput);
  if (!Array.isArray(scenarioInput?.constraints) || scenarioInput.constraints.length === 0) {
    return ['Approval is required before external writes.', 'CI must pass before release summary is emitted.'];
  }
  return scenarioInput.constraints.map((item) => String(item)).filter(Boolean);
}

function normalizeTargets(runInput: Record<string, unknown> | undefined, runId: string): SampleChangeTargets {
  const scenarioInput = unwrapScenarioInput(runInput);
  const targets = isRecord(scenarioInput?.targets) ? scenarioInput.targets : undefined;
  return {
    issueRef: typeof targets?.issueRef === 'string' && targets.issueRef ? targets.issueRef : `ISSUE-${runId.slice(0, 8)}`,
    changeReviewRef: typeof targets?.changeReviewRef === 'string' && targets.changeReviewRef
      ? targets.changeReviewRef
      : `CR-${runId.slice(0, 8)}`,
    pipelineRef: typeof targets?.pipelineRef === 'string' && targets.pipelineRef ? targets.pipelineRef : `pipeline:${runId}`,
  };
}

function normalizeRiskLevel(runInput: Record<string, unknown> | undefined): ChangeIntentPayload['riskLevel'] {
  const scenarioInput = unwrapScenarioInput(runInput);
  if (scenarioInput?.riskLevel === 'low' || scenarioInput?.riskLevel === 'high') {
    return scenarioInput.riskLevel;
  }
  return 'medium';
}

function normalizePipelineSignal(runInput: Record<string, unknown> | undefined, runId: string): {
  eventId: string;
  pipelineRef: string;
  issueRef: string;
  status: ValidationReportPayload['status'];
  summary: string;
  details: Record<string, unknown>;
} {
  const scenarioInput = unwrapScenarioInput(runInput);
  const targets = normalizeTargets(runInput, runId);
  return {
    eventId: typeof scenarioInput?.eventId === 'string' && scenarioInput.eventId ? scenarioInput.eventId : `event:${runId}`,
    pipelineRef: typeof scenarioInput?.pipelineRef === 'string' && scenarioInput.pipelineRef
      ? scenarioInput.pipelineRef
      : targets.pipelineRef,
    issueRef: typeof scenarioInput?.issueRef === 'string' && scenarioInput.issueRef ? scenarioInput.issueRef : targets.issueRef,
    status: scenarioInput?.status === 'failed' ? 'failed' : 'passed',
    summary: typeof scenarioInput?.summary === 'string' && scenarioInput.summary
      ? scenarioInput.summary
      : 'Pipeline completed successfully.',
    details: isRecord(scenarioInput?.details) ? scenarioInput.details : {},
  };
}

function buildParseMetadata(
  runId: string,
  workflow: WorkflowCompatContextEnvelope,
): WorkflowCompatCompletionMetadata {
  const subject = normalizeSubject(workflow.runInput, runId);
  const inputs = normalizeInputs(workflow.runInput);
  const payload: ObservationArtifactPayload = {
    subjectRef: subject.subjectRef,
    subjectType: subject.subjectType,
    materialRefs: inputs.map((_item, index) => `input:${runId}:${index + 1}`),
    observations: inputs.map((item, index) => `${item} -> 归一化观察 ${index + 1}`),
    parserWarnings: [],
  };

  return {
    artifacts: [
      {
        artifactType: 'ObservationArtifact',
        state: 'validated',
        payload: payload as Record<string, unknown>,
        metadata: {
          lineage: {
            nodeKey: workflow.nodeKey,
            sourceMaterialCount: inputs.length,
          },
        },
      },
    ],
  };
}

function buildAssessmentMetadata(
  runId: string,
  workflow: WorkflowCompatContextEnvelope,
): WorkflowCompatCompletionMetadata {
  const subject = normalizeSubject(workflow.runInput, runId);
  const observationRefs = workflow.upstreamArtifactRefs
    .filter((item) => item.artifactType === 'ObservationArtifact')
    .map((item) => item.artifactId);
  const inputs = normalizeInputs(workflow.runInput);
  const assessmentPayload: AssessmentDraftPayload = {
    subjectRef: subject.subjectRef,
    subjectType: subject.subjectType,
    findings: [`${subject.displayName} 在示例输入中呈现出稳定信号。`],
    strengths: ['输入上下文已完成结构化收敛', 'review gate 前的正式对象已生成'],
    concerns: ['仍需人工复核后再向外部分发'],
    recommendedActions: ['补充 reviewer 结论', '在发布前确认交付受众'],
  };
  const evidencePayload: EvidencePackPayload = {
    subjectRef: subject.subjectRef,
    subjectType: subject.subjectType,
    sourceArtifactRefs: observationRefs,
    observationRefs,
    supportingExcerpts: inputs.map((item, index) => `${item} 片段 ${index + 1}`),
    confidenceNotes: ['mock parser 输出，适合验证 lineage 与 review gate'],
  };
  const recipePayload: AnalysisRecipeCandidatePayload = {
    title: `${subject.displayName} workflow 配方候选`,
    normalizedSteps: ['收集输入', '提炼上下文', '生成评审草稿', '输出交付视图'],
    assumptions: ['输入覆盖本次 review 关注点', '示例 workflow 使用 deterministic mock 逻辑'],
    reviewerNotes: ['仅用于平台链路验证，不代表正式业务规则'],
    evidenceRefs: [],
  };

  return {
    artifacts: [
      {
        artifactType: 'AssessmentDraft',
        state: 'review_required',
        payload: assessmentPayload as Record<string, unknown>,
        metadata: {
          lineage: {
            nodeKey: workflow.nodeKey,
            observationRefs,
          },
        },
      },
      {
        artifactType: 'EvidencePack',
        state: 'validated',
        payload: evidencePayload as Record<string, unknown>,
        metadata: {
          lineage: {
            nodeKey: workflow.nodeKey,
            observationRefs,
          },
        },
      },
      {
        artifactType: 'AnalysisRecipeCandidate',
        state: 'validated',
        payload: recipePayload as Record<string, unknown>,
        metadata: {
          lineage: {
            nodeKey: workflow.nodeKey,
            evidenceArtifactTypes: ['EvidencePack'],
          },
        },
      },
    ],
  };
}

function buildDeliveryMetadata(
  runId: string,
  workflow: WorkflowCompatContextEnvelope,
): WorkflowCompatCompletionMetadata {
  const subject = normalizeSubject(workflow.runInput, runId);
  const reviewer = normalizeReviewerActor(workflow.runInput, runId);
  const audiences = normalizeAudiences(workflow.runInput, runId);
  const temporaryCollaborators = normalizeTemporaryCollaborators(workflow.runInput, runId);
  const assessmentRef = workflow.upstreamArtifactRefs.find((item) => item.artifactType === 'AssessmentDraft')?.artifactId;
  const evidenceRef = workflow.upstreamArtifactRefs.find((item) => item.artifactType === 'EvidencePack')?.artifactId;
  const deliveryPayload: ReviewableDeliveryPayload = {
    presentationRef: `presentation:${runId}:reviewable-delivery`,
    audienceType: 'fanout_bundle',
    approvedContentSlots: ['summary', 'actions', 'next_step'],
    redactions: ['internal_confidence_notes'],
  };

  return {
    artifacts: [
      {
        artifactType: 'ReviewableDelivery',
        state: 'published',
        payload: deliveryPayload as Record<string, unknown>,
        metadata: {
          lineage: {
            nodeKey: workflow.nodeKey,
            assessmentRef,
            evidenceRef,
          },
        },
      },
    ],
    actorProfiles: [
      {
        actorId: reviewer.actorId,
        workspaceId: `workspace:${runId}`,
        status: 'active',
        displayName: reviewer.displayName,
        actorType: 'person',
        payloadJson: { role: 'workflow_reviewer' },
      },
      {
        actorId: subject.subjectRef,
        workspaceId: `workspace:${runId}`,
        status: 'active',
        displayName: subject.displayName,
        actorType: subject.subjectType === 'group' ? 'cohort' : 'person',
        payloadJson: { subjectType: subject.subjectType },
      },
      ...audiences.map((audience) => ({
        actorId: audience.actorId,
        workspaceId: `workspace:${runId}`,
        status: 'active' as const,
        displayName: audience.displayName,
        actorType: audience.actorType,
        payloadJson: { audienceType: audience.audienceType },
      })),
      ...temporaryCollaborators.map((collaborator) => ({
        actorId: collaborator.actorId,
        workspaceId: `workspace:${runId}`,
        status: 'active' as const,
        displayName: collaborator.displayName,
        actorType: 'person' as const,
        payloadJson: { role: 'temporary_collaborator' },
      })),
    ],
    actorMemberships: [
      {
        actorMembershipId: `membership:${runId}:reviewer-subject`,
        fromActorId: reviewer.actorId,
        toActorId: subject.subjectRef,
        relationType: 'responsible_for',
        status: 'active',
        confirmedAt: Date.now(),
        payloadJson: { scope: 'review' },
      },
      ...temporaryCollaborators.map((collaborator, index) => ({
        actorMembershipId: `membership:${runId}:temp:${index + 1}`,
        fromActorId: collaborator.actorId,
        toActorId: subject.subjectRef,
        relationType: 'collaborates_with',
        status: 'pending_confirmation' as const,
        payloadJson: { scope: 'review_only' },
      })),
    ],
    audienceSelector: {
      audienceSelectorId: `audsel:${runId}`,
      status: 'bound',
      selectorJson: {
        audienceTypes: audiences.map((audience) => audience.audienceType),
      },
    },
    deliverySpec: {
      deliverySpecId: `delspec:${runId}`,
      audienceSelectorId: `audsel:${runId}`,
      reviewRequired: true,
      deliveryMode: 'assisted_delivery',
      status: 'active',
      configJson: {
        redactions: deliveryPayload.redactions,
      },
    },
    deliveryTargets: audiences.map((audience, index) => ({
      deliveryTargetId: `deltarget:${runId}:${index + 1}`,
      deliverySpecId: `delspec:${runId}`,
      targetActorId: audience.actorId,
      status: 'delivered',
      payloadJson: {
        audienceType: audience.audienceType,
        presentationRef: deliveryPayload.presentationRef,
      },
    })),
  };
}

function buildChangeIntentMetadata(
  runId: string,
  workflow: WorkflowCompatContextEnvelope,
): WorkflowCompatCompletionMetadata {
  const requester = normalizeRequester(workflow.runInput, runId);
  const scenarioInput = unwrapScenarioInput(workflow.runInput);
  const payload: ChangeIntentPayload = {
    changeRef: normalizeChangeRef(workflow.runInput, runId),
    requesterActorId: requester.actorId,
    requesterDisplayName: requester.displayName,
    summary: typeof scenarioInput?.summary === 'string' && scenarioInput.summary
      ? scenarioInput.summary
      : 'Validate the governed release collaboration flow.',
    rationale: typeof scenarioInput?.rationale === 'string' && scenarioInput.rationale
      ? scenarioInput.rationale
      : 'Exercise issue tracking, change review, and CI callback handling.',
    targetSystems: normalizeTargetSystems(workflow.runInput),
    riskLevel: normalizeRiskLevel(workflow.runInput),
    constraints: normalizeConstraints(workflow.runInput),
  };

  return {
    artifacts: [
      {
        artifactType: 'ChangeIntent',
        state: 'validated',
        payload: payload as Record<string, unknown>,
        metadata: {
          lineage: {
            nodeKey: workflow.nodeKey,
            requesterActorId: requester.actorId,
            targetSystems: payload.targetSystems,
          },
        },
      },
    ],
  };
}

function buildExecutionPlanMetadata(
  runId: string,
  workflow: WorkflowCompatContextEnvelope,
): WorkflowCompatCompletionMetadata {
  const changeRef = normalizeChangeRef(workflow.runInput, runId);
  const targets = normalizeTargets(workflow.runInput, runId);
  const payload: ExecutionPlanPayload = {
    planRef: `plan:${runId}`,
    changeRef,
    summary: 'Review, synchronize issue/change review state, then wait for CI callback before publishing the delivery summary.',
    steps: [
      'Review the requested change intent and confirm risk acceptance.',
      'Upsert issue tracker state for the requested release.',
      'Upsert source-control change review record.',
      'Start CI pipeline and await callback.',
      'Publish delivery summary with next-step guidance.',
    ],
    actionRefs: ['issue_upsert', 'change_review_upsert', 'pipeline_start'],
    successCriteria: [
      `Issue ${targets.issueRef} is synchronized.`,
      `Change review ${targets.changeReviewRef} is available for reviewers.`,
      `Pipeline ${targets.pipelineRef} reports passed status.`,
    ],
    rollbackPlan: [
      'Keep the issue in follow-up-required state.',
      'Request manual reviewer intervention on the change review.',
      'Do not emit a release-ready delivery summary until CI is green.',
    ],
  };

  return {
    artifacts: [
      {
        artifactType: 'ExecutionPlan',
        state: 'validated',
        payload: payload as Record<string, unknown>,
        metadata: {
          lineage: {
            nodeKey: workflow.nodeKey,
            changeRef,
            actionRefs: payload.actionRefs,
          },
        },
      },
    ],
  };
}

function buildDeliverySummaryMetadata(
  runId: string,
  workflow: WorkflowCompatContextEnvelope,
): WorkflowCompatCompletionMetadata {
  const changeRef = normalizeChangeRef(workflow.runInput, runId);
  const targets = normalizeTargets(workflow.runInput, runId);
  const validationReports = workflow.upstreamArtifactRefs.filter((item) => item.artifactType === 'ValidationReport');
  const actionReceipts = workflow.upstreamArtifactRefs.filter((item) => item.artifactType === 'ActionReceipt');
  const payload: DeliverySummaryPayload = {
    changeRef,
    disposition: validationReports.length > 0 ? 'ready_for_release' : 'follow_up_required',
    summary: validationReports.length > 0
      ? 'Issue tracker, change review, and CI checks are aligned for release handoff.'
      : 'Awaiting CI validation before release handoff can be completed.',
    issueRefs: [targets.issueRef],
    changeReviewRefs: [targets.changeReviewRef],
    pipelineRefs: [targets.pipelineRef],
    nextSteps: validationReports.length > 0
      ? ['Share the delivery summary with stakeholders.', 'Proceed with the planned release window.']
      : ['Investigate pending validation signal.', 'Keep the change in review-required status.'],
  };

  return {
    artifacts: [
      {
        artifactType: 'DeliverySummary',
        state: 'published',
        payload: payload as Record<string, unknown>,
        metadata: {
          lineage: {
            nodeKey: workflow.nodeKey,
            actionReceiptCount: actionReceipts.length,
            validationReportCount: validationReports.length,
          },
        },
      },
    ],
  };
}

function buildValidationSignalMetadata(
  runId: string,
  workflow: WorkflowCompatContextEnvelope,
): WorkflowCompatCompletionMetadata {
  const signal = normalizePipelineSignal(workflow.runInput, runId);
  const payload: ValidationReportPayload = {
    pipelineRef: signal.pipelineRef,
    status: signal.status,
    summary: signal.summary,
    details: {
      ...signal.details,
      eventId: signal.eventId,
      issueRef: signal.issueRef,
    },
  };

  return {
    artifacts: [
      {
        artifactType: 'ValidationReport',
        state: 'validated',
        payload: payload as Record<string, unknown>,
        metadata: {
          lineage: {
            nodeKey: workflow.nodeKey,
            triggerSource: 'event_subscription',
            eventId: signal.eventId,
          },
        },
      },
    ],
  };
}

function buildWorkflowImmediateEvents(
  runId: string,
  workflow: WorkflowCompatContextEnvelope,
): InteractionEvent[] {
  let metadata: WorkflowCompatCompletionMetadata;
  let message = `sample executor completed ${workflow.nodeKey}`;
  if (workflow.nodeKey === 'capture_inputs' || workflow.nodeKey === 'parse_materials') {
    metadata = buildParseMetadata(runId, workflow);
    message = 'sample executor 已完成输入归一化阶段。';
  } else if (workflow.nodeKey === 'synthesize_review_draft' || workflow.nodeKey === 'generate_assessment') {
    metadata = buildAssessmentMetadata(runId, workflow);
    message = 'sample executor 已生成 draft / evidence / recipe candidate。';
  } else if (workflow.nodeKey === 'publish_delivery' || workflow.nodeKey === 'fanout_delivery') {
    metadata = buildDeliveryMetadata(runId, workflow);
    message = 'sample executor 已完成 delivery publish。';
  } else if (workflow.nodeKey === 'capture_change_intent') {
    metadata = buildChangeIntentMetadata(runId, workflow);
    message = 'sample executor 已生成研发协作变更意图。';
  } else if (workflow.nodeKey === 'synthesize_execution_plan') {
    metadata = buildExecutionPlanMetadata(runId, workflow);
    message = 'sample executor 已生成研发协作执行计划。';
  } else if (workflow.nodeKey === 'summarize_delivery') {
    metadata = buildDeliverySummaryMetadata(runId, workflow);
    message = 'sample executor 已汇总研发协作交付摘要。';
  } else if (workflow.nodeKey === 'capture_validation_signal') {
    metadata = buildValidationSignalMetadata(runId, workflow);
    message = 'sample executor 已归一化 pipeline 验证信号。';
  } else {
    metadata = {};
  }

  return [
    {
      type: 'assistant_message',
      text: message,
    },
    buildTaskState(runId, `task:${runId}:${workflow.nodeKey}`, 'completed', 'auto_execute', {
      workflowNodeKey: workflow.nodeKey,
      ...(metadata as Record<string, unknown>),
    }),
  ];
}

const app = express();
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as RawBodyRequest).rawBody = buf.toString('utf8');
  },
}));

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info('http request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'provider-sample' });
});

app.get('/.well-known/uniassist/manifest.json', (_req, res) => {
  res.json({
    schemaVersion: 'v0',
    providerId: PROVIDER_ID,
    name: 'Sample Provider',
    version: '0.3.0',
    description: 'Neutral sample provider and compat executor for UniAssist validation flows.',
    capabilities: {
      inputs: ['text'],
      interactionEvents: ['ack', 'assistant_message', 'provider_extension', 'request_clarification', 'card'],
      streaming: true,
    },
    navigation: {
      settingsHref: '/settings/sample',
      detailHref: '/providers/sample',
      progressHref: '/providers/sample/progress',
    },
    sla: {
      ackWithinMs: 800,
      maxSyncResponseMs: 5000,
    },
    security: {
      auth: 'client_credentials',
      requiredScopes: ['provider:invoke', 'provider:interact', 'context:read'],
    },
  });
});

app.post('/v0/invoke', async (req: RawBodyRequest, res) => {
  const traceId = (req.body as ProviderInvokeRequest | undefined)?.input?.traceId;
  const authorized = await guardInternalAuth(req, res, {
    endpoint: '/v0/invoke',
    requiredScopes: ['provider:invoke'],
    traceId,
  });
  if (!authorized) return;

  const body = req.body as ProviderInvokeRequest;
  if (!body || body.schemaVersion !== 'v0' || body.run.providerId !== PROVIDER_ID) {
    res.status(400).json({
      schemaVersion: 'v0',
      type: 'https://uniassist/errors/invalid_request',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_INVOKE_REQUEST',
      detail: 'schemaVersion/run.providerId are invalid',
    });
    return;
  }

  const workflow = getWorkflowEnvelope(body.input.raw);
  if (workflow) {
    const response: ProviderInvokeResponse = {
      schemaVersion: 'v0',
      runId: body.run.runId,
      providerId: PROVIDER_ID,
      ack: {
        type: 'ack',
        message: `sample compat executor accepted ${workflow.nodeKey}`,
      },
      immediateEvents: buildWorkflowImmediateEvents(body.run.runId, workflow),
    };
    res.json(response);
    return;
  }

  const taskId = `task:${body.run.runId}`;
  sampleTaskMemory.set(taskId, {});

  const response: ProviderInvokeResponse = {
    schemaVersion: 'v0',
    runId: body.run.runId,
    providerId: PROVIDER_ID,
    ack: {
      type: 'ack',
      message: 'sample 专项已接收请求，先确认样例主题。',
    },
    immediateEvents: [
      buildTaskQuestion(
        body.run.runId,
        taskId,
        `${taskId}:subject`,
        '请告诉我要生成哪种样例 workflow 主题。',
        SUBJECT_SCHEMA,
        SUBJECT_UI_SCHEMA,
      ),
    ],
  };

  res.json(response);
});

app.post('/v0/interact', async (req: RawBodyRequest, res) => {
  const traceId = (req.body as ProviderInteractRequest | undefined)?.interaction?.traceId;
  const authorized = await guardInternalAuth(req, res, {
    endpoint: '/v0/interact',
    requiredScopes: ['provider:interact'],
    traceId,
  });
  if (!authorized) return;

  const body = req.body as ProviderInteractRequest;
  if (!body || body.schemaVersion !== 'v0') {
    res.status(400).json({
      schemaVersion: 'v0',
      type: 'https://uniassist/errors/invalid_request',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_INTERACT_REQUEST',
      detail: 'schemaVersion is required',
    });
    return;
  }

  const workflow = getWorkflowEnvelope(body.interaction.payload);
  if (workflow) {
    const response: ProviderInteractResponse = {
      schemaVersion: 'v0',
      runId: body.run.runId,
      events: [
        {
          type: 'ack',
          message: `sample compat executor received interact for ${workflow.nodeKey}`,
        },
      ],
    };
    res.json(response);
    return;
  }

  const taskId = normalizeTaskId(body);
  const actionId = body.interaction.actionId;
  const task = sampleTaskMemory.get(taskId) || {};
  const events: InteractionEvent[] = [];

  if (actionId.startsWith('answer_task_question') || actionId.startsWith('submit_data_collection')) {
    const subject = extractSubjectText(body.interaction.payload);
    const inputSummary = extractInputSummary(body.interaction.payload);

    if (subject && !task.subject) task.subject = subject;
    if (inputSummary && !task.inputSummary) task.inputSummary = inputSummary;

    if (!task.subject) {
      events.push(buildTaskQuestion(body.run.runId, taskId, `${taskId}:subject`, '我还缺少样例主题，请补充。', SUBJECT_SCHEMA, SUBJECT_UI_SCHEMA));
      sampleTaskMemory.set(taskId, task);
    } else if (!task.inputSummary) {
      events.push(buildTaskQuestion(body.run.runId, taskId, `${taskId}:summary`, '请补充这次样例使用的输入摘要。', SUMMARY_SCHEMA, SUMMARY_UI_SCHEMA));
      sampleTaskMemory.set(taskId, task);
    } else {
      sampleTaskMemory.set(taskId, task);
      events.push(
        buildTaskState(body.run.runId, taskId, 'ready', 'require_user_confirm', {
          subject: task.subject,
          inputSummary: task.inputSummary,
          missingFields: [],
        }),
      );
      events.push({
        type: 'assistant_message',
        text: '样例输入已完整，我已准备执行示例流程。请确认是否开始执行。',
      });
    }
  } else if (actionId.startsWith('execute_task')) {
    if (!task.subject || !task.inputSummary) {
      events.push(buildTaskQuestion(body.run.runId, taskId, `${taskId}:subject`, '执行前仍需要先确认样例主题。', SUBJECT_SCHEMA, SUBJECT_UI_SCHEMA));
    } else {
      events.push(buildTaskState(body.run.runId, taskId, 'executing', 'require_user_confirm', {
        subject: task.subject,
        inputSummary: task.inputSummary,
      }));
      events.push({
        type: 'assistant_message',
        text: `正在执行样例流程：${task.subject}`,
      });
      events.push(buildTaskState(body.run.runId, taskId, 'completed', 'require_user_confirm', {
        subject: task.subject,
        inputSummary: task.inputSummary,
      }));
      events.push({
        type: 'assistant_message',
        text: '样例执行流程已完成，你可以继续追加更多验证条件。',
      });
    }
  } else {
    events.push({
      type: 'ack',
      message: 'sample 专项已收到交互动作。',
    });
  }

  const response: ProviderInteractResponse = {
    schemaVersion: 'v0',
    runId: body.run.runId,
    events,
  };

  res.json(response);
});

app.listen(PORT, () => {
  if (INTERNAL_AUTH_CONFIG.replayBackend === 'redis') {
    logger.warn('internal auth replay backend requested redis but provider currently uses in-memory nonce store', {
      requestedReplayBackend: INTERNAL_AUTH_CONFIG.replayBackend,
    });
  }
  logger.info('provider-sample listening', { port: PORT });
});
