import type {
  WorkflowTemplateRecord,
  WorkflowTemplateSpec,
  WorkflowTemplateVersionRecord,
} from './types';

export const CANONICAL_TEACHING_WORKFLOW_KEY = 'sample-b3-teaching';
export const CANONICAL_TEACHING_COMPAT_PROVIDER_ID = 'sample';

export function buildCanonicalTeachingWorkflowSpec(): WorkflowTemplateSpec {
  return {
    schemaVersion: 'v1',
    workflowKey: CANONICAL_TEACHING_WORKFLOW_KEY,
    name: 'Teaching Validation Sample',
    compatProviderId: CANONICAL_TEACHING_COMPAT_PROVIDER_ID,
    entryNode: 'parse_materials',
    nodes: [
      {
        nodeKey: 'parse_materials',
        nodeType: 'executor',
        executorId: 'compat-sample',
        transitions: {
          success: 'generate_assessment',
        },
      },
      {
        nodeKey: 'generate_assessment',
        nodeType: 'executor',
        executorId: 'compat-sample',
        transitions: {
          success: 'teacher_review',
        },
      },
      {
        nodeKey: 'teacher_review',
        nodeType: 'approval_gate',
        config: {
          reviewArtifactTypes: ['AssessmentDraft', 'EvidencePack'],
        },
        transitions: {
          approved: 'fanout_delivery',
        },
      },
      {
        nodeKey: 'fanout_delivery',
        nodeType: 'executor',
        executorId: 'compat-sample',
        transitions: {
          success: 'finish',
        },
      },
      {
        nodeKey: 'finish',
        nodeType: 'end',
      },
    ],
    metadata: {
      scenario: 'teaching_validation',
      source: 'canonical_sample_helper',
    },
  };
}

export function buildCanonicalTeachingRunInput(): Record<string, unknown> {
  return {
    subject: {
      subjectRef: 'student:case-1',
      subjectType: 'student',
      displayName: 'Alex',
    },
    materials: [
      '课堂观察记录',
      '作业提交摘要',
    ],
    teacherActor: {
      actorId: 'teacher:primary',
      displayName: 'Ms. Li',
    },
    audiences: [
      {
        audienceType: 'parent',
        actorId: 'parent:case-1',
        displayName: 'Parent Case 1',
      },
      {
        audienceType: 'student',
        actorId: 'student:case-1',
        displayName: 'Alex',
      },
      {
        audienceType: 'group',
        actorId: 'group:class-a',
        displayName: 'Class A',
        actorType: 'cohort',
      },
    ],
    temporaryCollaborators: [
      {
        actorId: 'assistant:temp-1',
        displayName: 'Assistant Temp 1',
      },
    ],
  };
}

export function buildCanonicalTeachingTemplate(params: {
  workflowId: string;
  templateVersionId: string;
  version?: number;
  timestampMs?: number;
}): {
  template: WorkflowTemplateRecord;
  version: WorkflowTemplateVersionRecord;
} {
  const timestampMs = params.timestampMs ?? Date.now();
  const spec = buildCanonicalTeachingWorkflowSpec();
  return {
    template: {
      workflowId: params.workflowId,
      workflowKey: spec.workflowKey,
      name: spec.name,
      compatProviderId: spec.compatProviderId,
      status: 'active',
      createdAt: timestampMs,
      updatedAt: timestampMs,
    },
    version: {
      templateVersionId: params.templateVersionId,
      workflowId: params.workflowId,
      workflowKey: spec.workflowKey,
      version: params.version ?? 1,
      status: 'published',
      spec,
      createdAt: timestampMs,
    },
  };
}
