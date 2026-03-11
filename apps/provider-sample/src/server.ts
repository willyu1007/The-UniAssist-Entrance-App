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
  AnalysisRecipeCandidatePayload,
  AssessmentDraftPayload,
  EvidencePackPayload,
  ObservationArtifactPayload,
  ReviewableDeliveryPayload,
  WorkflowCompatCompletionMetadata,
  WorkflowCompatContextEnvelope,
} from '@baseinterface/workflow-contracts';

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
  materialsSummary?: string;
};

type SampleSubject = {
  subjectRef: string;
  subjectType: string;
  displayName: string;
};

type SampleTeacherActor = {
  actorId: string;
  displayName: string;
};

type SampleAudience = {
  audienceType: string;
  actorId: string;
  displayName: string;
  actorType: 'person' | 'external_contact' | 'cohort';
};

const sampleTaskMemory = new Map<string, SampleTaskMemory>();

const SUBJECT_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string', title: '评估对象' },
  },
  required: ['text'],
};

const MATERIALS_SCHEMA = {
  type: 'object',
  properties: {
    materialsSummary: { type: 'string', title: '材料摘要' },
  },
  required: ['materialsSummary'],
};

const SUBJECT_UI_SCHEMA = {
  order: ['text'],
};

const MATERIALS_UI_SCHEMA = {
  order: ['materialsSummary'],
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

function extractMaterialsSummary(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) return undefined;
  if (typeof payload.materialsSummary === 'string' && payload.materialsSummary.trim()) {
    return payload.materialsSummary.trim();
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
      : '示例评估对象';
  return {
    subjectRef,
    subjectType,
    displayName,
  };
}

function normalizeMaterials(runInput: Record<string, unknown> | undefined): string[] {
  if (!Array.isArray(runInput?.materials) || runInput.materials.length === 0) {
    return ['课堂观察记录', '作业反馈'];
  }
  return runInput.materials.map((item, index) => {
    if (typeof item === 'string' && item.trim()) return item.trim();
    if (isRecord(item)) {
      if (typeof item.title === 'string' && item.title.trim()) return item.title.trim();
      if (typeof item.summary === 'string' && item.summary.trim()) return item.summary.trim();
    }
    return `材料 ${index + 1}`;
  });
}

function normalizeTeacherActor(runInput: Record<string, unknown> | undefined, runId: string): SampleTeacherActor {
  const teacherActor = isRecord(runInput?.teacherActor) ? runInput.teacherActor : undefined;
  return {
    actorId: typeof teacherActor?.actorId === 'string' && teacherActor.actorId
      ? teacherActor.actorId
      : `actor:${runId}:teacher`,
    displayName: typeof teacherActor?.displayName === 'string' && teacherActor.displayName
      ? teacherActor.displayName
      : '示例教师',
  };
}

function normalizeAudiences(runInput: Record<string, unknown> | undefined, runId: string): SampleAudience[] {
  if (!Array.isArray(runInput?.audiences) || runInput.audiences.length === 0) {
    return [
      {
        audienceType: 'parent',
        actorId: `actor:${runId}:parent`,
        displayName: '家长样例收件人',
        actorType: 'external_contact',
      },
      {
        audienceType: 'student',
        actorId: `actor:${runId}:student`,
        displayName: '学生样例收件人',
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

function buildParseMetadata(
  runId: string,
  workflow: WorkflowCompatContextEnvelope,
): WorkflowCompatCompletionMetadata {
  const subject = normalizeSubject(workflow.runInput, runId);
  const materials = normalizeMaterials(workflow.runInput);
  const payload: ObservationArtifactPayload = {
    subjectRef: subject.subjectRef,
    subjectType: subject.subjectType,
    materialRefs: materials.map((_item, index) => `material:${runId}:${index + 1}`),
    observations: materials.map((item, index) => `${item} -> 观察结论 ${index + 1}`),
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
            sourceMaterialCount: materials.length,
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
  const materials = normalizeMaterials(workflow.runInput);
  const assessmentPayload: AssessmentDraftPayload = {
    subjectRef: subject.subjectRef,
    subjectType: subject.subjectType,
    findings: [`${subject.displayName} 在示例材料中表现出稳定参与度。`],
    strengths: ['能及时响应课堂引导', '能根据反馈完成迭代'],
    concerns: ['需要在复杂任务中加强自我表达'],
    recommendedActions: ['继续提供分层反馈', '在下一轮课堂中加入结构化复盘'],
  };
  const evidencePayload: EvidencePackPayload = {
    subjectRef: subject.subjectRef,
    subjectType: subject.subjectType,
    sourceArtifactRefs: observationRefs,
    observationRefs,
    supportingExcerpts: materials.map((item, index) => `${item} 片段 ${index + 1}`),
    confidenceNotes: ['mock parser 输出，适合验证 lineage 与 review gate'],
  };
  const recipePayload: AnalysisRecipeCandidatePayload = {
    title: `${subject.displayName} 评估配方候选`,
    normalizedSteps: ['收集材料', '提炼观察', '生成评估草稿', '输出交付视图'],
    assumptions: ['材料覆盖最近一次课堂表现', '示例 workflow 使用 deterministic mock 逻辑'],
    reviewerNotes: ['仅用于平台链路验证，不代表正式教学 rubric'],
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
  const teacher = normalizeTeacherActor(workflow.runInput, runId);
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
        actorId: teacher.actorId,
        workspaceId: `workspace:${runId}`,
        status: 'active',
        displayName: teacher.displayName,
        actorType: 'person',
        payloadJson: { role: 'teacher_owner' },
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
        actorMembershipId: `membership:${runId}:teacher-subject`,
        fromActorId: teacher.actorId,
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

function buildWorkflowImmediateEvents(
  runId: string,
  workflow: WorkflowCompatContextEnvelope,
): InteractionEvent[] {
  let metadata: WorkflowCompatCompletionMetadata;
  let message = `sample executor completed ${workflow.nodeKey}`;
  if (workflow.nodeKey === 'parse_materials') {
    metadata = buildParseMetadata(runId, workflow);
    message = 'sample executor 已完成 parse 阶段。';
  } else if (workflow.nodeKey === 'generate_assessment') {
    metadata = buildAssessmentMetadata(runId, workflow);
    message = 'sample executor 已生成 assessment / evidence / recipe candidate。';
  } else if (workflow.nodeKey === 'fanout_delivery') {
    metadata = buildDeliveryMetadata(runId, workflow);
    message = 'sample executor 已完成 reviewable delivery fan-out。';
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
      message: 'sample 专项已接收请求，先确认评估对象。',
    },
    immediateEvents: [
      buildTaskQuestion(
        body.run.runId,
        taskId,
        `${taskId}:subject`,
        '请告诉我要生成哪种样例评估对象。',
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
    const materialsSummary = extractMaterialsSummary(body.interaction.payload);

    if (subject && !task.subject) task.subject = subject;
    if (materialsSummary && !task.materialsSummary) task.materialsSummary = materialsSummary;

    if (!task.subject) {
      events.push(buildTaskQuestion(body.run.runId, taskId, `${taskId}:subject`, '我还缺少评估对象，请补充。', SUBJECT_SCHEMA, SUBJECT_UI_SCHEMA));
      sampleTaskMemory.set(taskId, task);
    } else if (!task.materialsSummary) {
      events.push(buildTaskQuestion(body.run.runId, taskId, `${taskId}:materials`, '请补充这次样例使用的材料摘要。', MATERIALS_SCHEMA, MATERIALS_UI_SCHEMA));
      sampleTaskMemory.set(taskId, task);
    } else {
      sampleTaskMemory.set(taskId, task);
      events.push(
        buildTaskState(body.run.runId, taskId, 'ready', 'require_user_confirm', {
          subject: task.subject,
          materialsSummary: task.materialsSummary,
          missingFields: [],
        }),
      );
      events.push({
        type: 'assistant_message',
        text: '样例输入已完整，我已准备执行示例流程。请确认是否开始执行。',
      });
    }
  } else if (actionId.startsWith('execute_task')) {
    if (!task.subject || !task.materialsSummary) {
      events.push(buildTaskQuestion(body.run.runId, taskId, `${taskId}:subject`, '执行前仍需要先确认评估对象。', SUBJECT_SCHEMA, SUBJECT_UI_SCHEMA));
    } else {
      events.push(buildTaskState(body.run.runId, taskId, 'executing', 'require_user_confirm', {
        subject: task.subject,
        materialsSummary: task.materialsSummary,
      }));
      events.push({
        type: 'assistant_message',
        text: `正在执行样例流程：${task.subject}`,
      });
      events.push(buildTaskState(body.run.runId, taskId, 'completed', 'require_user_confirm', {
        subject: task.subject,
        materialsSummary: task.materialsSummary,
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
