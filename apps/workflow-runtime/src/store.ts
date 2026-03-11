import type {
  ActorMembershipRecord,
  ActorProfileRecord,
  AudienceSelectorRecord,
  DeliverySpecRecord,
  DeliveryTargetRecord,
  WorkflowApprovalDecisionRecord,
  WorkflowApprovalRequestRecord,
  WorkflowArtifactRecord,
  WorkflowNodeRunRecord,
  WorkflowRunRecord,
  WorkflowRunSnapshot,
  WorkflowTemplateRecord,
  WorkflowTemplateVersionRecord,
} from '@baseinterface/workflow-contracts';

export type InternalRunState = {
  template: WorkflowTemplateRecord;
  version: WorkflowTemplateVersionRecord;
  run: WorkflowRunRecord;
  nodeRuns: WorkflowNodeRunRecord[];
  approvals: WorkflowApprovalRequestRecord[];
  decisions: WorkflowApprovalDecisionRecord[];
  artifacts: WorkflowArtifactRecord[];
  actorProfiles: ActorProfileRecord[];
  actorMemberships: ActorMembershipRecord[];
  audienceSelectors: AudienceSelectorRecord[];
  deliverySpecs: DeliverySpecRecord[];
  deliveryTargets: DeliveryTargetRecord[];
};

export class RuntimeStore {
  private readonly runs = new Map<string, InternalRunState>();

  private readonly artifacts = new Map<string, WorkflowArtifactRecord>();

  private readonly approvals = new Map<string, WorkflowApprovalRequestRecord>();

  createRun(state: InternalRunState): InternalRunState {
    this.runs.set(state.run.runId, state);
    return state;
  }

  getRun(runId: string): InternalRunState | undefined {
    return this.runs.get(runId);
  }

  saveRun(state: InternalRunState): InternalRunState {
    this.runs.set(state.run.runId, state);
    state.artifacts.forEach((artifact) => {
      this.artifacts.set(artifact.artifactId, artifact);
    });
    state.approvals.forEach((approval) => {
      this.approvals.set(approval.approvalRequestId, approval);
    });
    return state;
  }

  listApprovals(): WorkflowApprovalRequestRecord[] {
    return [...this.approvals.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  getArtifact(artifactId: string): WorkflowArtifactRecord | undefined {
    return this.artifacts.get(artifactId);
  }

  snapshot(runId: string): WorkflowRunSnapshot | undefined {
    const state = this.runs.get(runId);
    if (!state) return undefined;
    return {
      run: state.run,
      nodeRuns: state.nodeRuns,
      approvals: state.approvals,
      approvalDecisions: state.decisions,
      artifacts: state.artifacts,
      actorProfiles: state.actorProfiles,
      actorMemberships: state.actorMemberships,
      audienceSelectors: state.audienceSelectors,
      deliverySpecs: state.deliverySpecs,
      deliveryTargets: state.deliveryTargets,
    };
  }
}
