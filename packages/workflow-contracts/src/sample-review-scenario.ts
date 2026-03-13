import type {
  WorkflowTemplateRecord,
  WorkflowTemplateSpec,
  WorkflowTemplateVersionRecord,
} from './types';

export const CANONICAL_SAMPLE_REVIEW_WORKFLOW_KEY = 'sample-review-validation';

export function buildCanonicalSampleReviewWorkflowSpec(): WorkflowTemplateSpec {
  return {
    schemaVersion: 'v1',
    workflowKey: CANONICAL_SAMPLE_REVIEW_WORKFLOW_KEY,
    name: 'Sample Review Validation',
    entryNode: 'capture_inputs',
    nodes: [
      {
        nodeKey: 'capture_inputs',
        nodeType: 'executor',
        executorId: 'sample-review-capture',
        transitions: {
          success: 'synthesize_review_draft',
        },
      },
      {
        nodeKey: 'synthesize_review_draft',
        nodeType: 'executor',
        executorId: 'sample-review-synthesize',
        transitions: {
          success: 'approval_review',
        },
      },
      {
        nodeKey: 'approval_review',
        nodeType: 'approval_gate',
        config: {
          reviewArtifactTypes: ['AssessmentDraft', 'EvidencePack'],
        },
        transitions: {
          approved: 'publish_delivery',
        },
      },
      {
        nodeKey: 'publish_delivery',
        nodeType: 'executor',
        executorId: 'sample-review-publish',
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
      scenario: 'sample_review_validation',
      source: 'canonical_sample_helper',
    },
  };
}

export function buildCanonicalSampleReviewRunInput(): Record<string, unknown> {
  return {
    subject: {
      subjectRef: 'case:sample-1',
      subjectType: 'case',
      displayName: 'Case 1',
    },
    inputs: [
      '需求摘要',
      '历史上下文',
    ],
    reviewerActor: {
      actorId: 'reviewer:primary',
      displayName: 'Primary Reviewer',
    },
    audiences: [
      {
        audienceType: 'stakeholder',
        actorId: 'stakeholder:case-1',
        displayName: 'Stakeholder Case 1',
      },
      {
        audienceType: 'requester',
        actorId: 'requester:case-1',
        displayName: 'Requester Case 1',
      },
      {
        audienceType: 'team',
        actorId: 'team:platform',
        displayName: 'Platform Team',
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

export function buildCanonicalSampleReviewTemplate(params: {
  workflowId: string;
  templateVersionId: string;
  version?: number;
  timestampMs?: number;
}): {
  template: WorkflowTemplateRecord;
  version: WorkflowTemplateVersionRecord;
} {
  const timestampMs = params.timestampMs ?? Date.now();
  const spec = buildCanonicalSampleReviewWorkflowSpec();
  return {
    template: {
      workflowId: params.workflowId,
      workflowKey: spec.workflowKey,
      name: spec.name,
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
