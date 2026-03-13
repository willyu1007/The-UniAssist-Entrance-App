import type { ValidationReportPayload } from './connector-runtime';

export type ObservationArtifactPayload = {
  subjectRef: string;
  subjectType: string;
  materialRefs: string[];
  observations: string[];
  parserWarnings: string[];
};

export type AssessmentDraftPayload = {
  subjectRef: string;
  subjectType: string;
  findings: string[];
  strengths: string[];
  concerns: string[];
  recommendedActions: string[];
};

export type EvidencePackPayload = {
  subjectRef: string;
  subjectType: string;
  sourceArtifactRefs: string[];
  observationRefs: string[];
  supportingExcerpts: string[];
  confidenceNotes: string[];
};

export type ReviewableDeliveryPayload = {
  presentationRef: string;
  audienceType: string;
  approvedContentSlots: string[];
  redactions: string[];
};

export type AnalysisRecipeCandidatePayload = {
  title: string;
  normalizedSteps: string[];
  assumptions: string[];
  reviewerNotes: string[];
  evidenceRefs: string[];
};

export type ChangeIntentPayload = {
  changeRef: string;
  requesterActorId: string;
  requesterDisplayName: string;
  summary: string;
  rationale: string;
  targetSystems: string[];
  riskLevel: 'low' | 'medium' | 'high';
  constraints: string[];
};

export type ExecutionPlanPayload = {
  planRef: string;
  changeRef: string;
  summary: string;
  steps: string[];
  actionRefs: string[];
  successCriteria: string[];
  rollbackPlan: string[];
};

export type DeliverySummaryPayload = {
  changeRef: string;
  disposition: 'ready_for_release' | 'follow_up_required' | 'blocked';
  summary: string;
  issueRefs: string[];
  changeReviewRefs: string[];
  pipelineRefs: string[];
  nextSteps: string[];
};

export type SampleReviewArtifactPayload =
  | ObservationArtifactPayload
  | AssessmentDraftPayload
  | EvidencePackPayload
  | ReviewableDeliveryPayload
  | AnalysisRecipeCandidatePayload;

export type RndCollabValidationArtifactPayload =
  | ChangeIntentPayload
  | ExecutionPlanPayload
  | DeliverySummaryPayload
  | ValidationReportPayload;

export * from './sample-review-scenario';
export * from './rnd-collab-scenario';
