import type {
  WorkflowTemplateRecord,
  WorkflowTemplateSpec,
  WorkflowTemplateVersionRecord,
} from './types';

export const CANONICAL_RND_COLLAB_WORKFLOW_KEY = 'sample-b8-rnd-collab';
export const CANONICAL_RND_COLLAB_EVENT_WORKFLOW_KEY = 'sample-b8-rnd-collab-event';

export function buildCanonicalRndCollabWorkflowSpec(): WorkflowTemplateSpec {
  return {
    schemaVersion: 'v1',
    workflowKey: CANONICAL_RND_COLLAB_WORKFLOW_KEY,
    name: 'R&D Collaboration Validation Sample',
    entryNode: 'capture_change_intent',
    nodes: [
      {
        nodeKey: 'capture_change_intent',
        nodeType: 'executor',
        executorId: 'collab-capture-intent',
        transitions: {
          success: 'synthesize_execution_plan',
        },
      },
      {
        nodeKey: 'synthesize_execution_plan',
        nodeType: 'executor',
        executorId: 'collab-synthesize-plan',
        transitions: {
          success: 'risk_review',
        },
      },
      {
        nodeKey: 'risk_review',
        nodeType: 'approval_gate',
        config: {
          reviewArtifactTypes: ['ChangeIntent', 'ExecutionPlan'],
        },
        transitions: {
          approved: 'issue_upsert',
        },
      },
      {
        nodeKey: 'issue_upsert',
        nodeType: 'executor',
        executorId: 'connector-runtime',
        config: {
          actionRef: 'issue_upsert',
        },
        transitions: {
          success: 'change_review_upsert',
        },
      },
      {
        nodeKey: 'change_review_upsert',
        nodeType: 'executor',
        executorId: 'connector-runtime',
        config: {
          actionRef: 'change_review_upsert',
        },
        transitions: {
          success: 'pipeline_start',
        },
      },
      {
        nodeKey: 'pipeline_start',
        nodeType: 'executor',
        executorId: 'connector-runtime',
        config: {
          actionRef: 'pipeline_start',
        },
        transitions: {
          success: 'summarize_delivery',
        },
      },
      {
        nodeKey: 'summarize_delivery',
        nodeType: 'executor',
        executorId: 'collab-summarize-delivery',
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
      scenario: 'rnd_collab_validation',
      mode: 'primary_change_flow',
      source: 'canonical_sample_helper',
    },
  };
}

export function buildCanonicalRndCollabEventWorkflowSpec(): WorkflowTemplateSpec {
  return {
    schemaVersion: 'v1',
    workflowKey: CANONICAL_RND_COLLAB_EVENT_WORKFLOW_KEY,
    name: 'R&D Collaboration Validation Event Sample',
    entryNode: 'capture_validation_signal',
    nodes: [
      {
        nodeKey: 'capture_validation_signal',
        nodeType: 'executor',
        executorId: 'collab-capture-signal',
        transitions: {
          success: 'issue_upsert',
        },
      },
      {
        nodeKey: 'issue_upsert',
        nodeType: 'executor',
        executorId: 'connector-runtime',
        config: {
          actionRef: 'issue_upsert',
        },
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
      scenario: 'rnd_collab_validation',
      mode: 'event_subscription_companion_flow',
      source: 'canonical_sample_helper',
    },
  };
}

export function buildCanonicalRndCollabRunInput(): Record<string, unknown> {
  return {
    changeRef: 'change:case-1',
    summary: 'Publish the B8 validation workflow with governed connector actions.',
    rationale: 'Validate release collaboration across issue tracking, change review, and CI callback handling.',
    targetSystems: ['issue_tracker', 'source_control', 'ci_pipeline'],
    riskLevel: 'medium',
    constraints: [
      'Approval is required before any external write action.',
      'CI must pass before delivery summary is emitted.',
    ],
    requester: {
      actorId: 'engineer:primary',
      displayName: 'Phoenix',
      team: 'platform',
    },
    reviewerActor: {
      actorId: 'reviewer:risk',
      displayName: 'Risk Reviewer',
    },
    targets: {
      issueRef: 'UA-101',
      changeReviewRef: 'CR-101',
      pipelineRef: 'pipeline:case-1',
    },
  };
}

export function buildCanonicalRndCollabEventPayload(): Record<string, unknown> {
  return {
    eventId: 'pipeline-finished-1',
    pipelineRef: 'pipeline:case-1',
    status: 'passed',
    summary: 'Pipeline completed successfully for change case 1.',
    details: {
      commit: 'abc123',
      environment: 'staging',
    },
    issueRef: 'UA-101',
  };
}

function buildTemplateRecord(
  workflowId: string,
  spec: WorkflowTemplateSpec,
  timestampMs: number,
): WorkflowTemplateRecord {
  return {
    workflowId,
    workflowKey: spec.workflowKey,
    name: spec.name,
    status: 'active',
    createdAt: timestampMs,
    updatedAt: timestampMs,
  };
}

function buildVersionRecord(
  workflowId: string,
  templateVersionId: string,
  spec: WorkflowTemplateSpec,
  timestampMs: number,
  version: number,
): WorkflowTemplateVersionRecord {
  return {
    templateVersionId,
    workflowId,
    workflowKey: spec.workflowKey,
    version,
    status: 'published',
    spec,
    createdAt: timestampMs,
  };
}

export function buildCanonicalRndCollabTemplate(params: {
  workflowId: string;
  templateVersionId: string;
  version?: number;
  timestampMs?: number;
}): {
  template: WorkflowTemplateRecord;
  version: WorkflowTemplateVersionRecord;
} {
  const timestampMs = params.timestampMs ?? Date.now();
  const spec = buildCanonicalRndCollabWorkflowSpec();
  return {
    template: buildTemplateRecord(params.workflowId, spec, timestampMs),
    version: buildVersionRecord(
      params.workflowId,
      params.templateVersionId,
      spec,
      timestampMs,
      params.version ?? 1,
    ),
  };
}

export function buildCanonicalRndCollabEventTemplate(params: {
  workflowId: string;
  templateVersionId: string;
  version?: number;
  timestampMs?: number;
}): {
  template: WorkflowTemplateRecord;
  version: WorkflowTemplateVersionRecord;
} {
  const timestampMs = params.timestampMs ?? Date.now();
  const spec = buildCanonicalRndCollabEventWorkflowSpec();
  return {
    template: buildTemplateRecord(params.workflowId, spec, timestampMs),
    version: buildVersionRecord(
      params.workflowId,
      params.templateVersionId,
      spec,
      timestampMs,
      params.version ?? 1,
    ),
  };
}
