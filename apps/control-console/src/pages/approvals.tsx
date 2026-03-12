import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArtifactEvidenceList,
  DecisionHistory,
  EmptyPanel,
  ErrorPanel,
  formatApprovalLabel,
  formatDateTime,
  LoadingPanel,
  PanelCard,
  RunSummaryHeader,
  SummaryGrid,
} from '../components';
import { useApprovalDecisionMutation, useApprovalDetailQuery, useApprovalQueueQuery } from '../query';

export function ApprovalsWorkspace(props: { selectedApprovalRequestId?: string }) {
  const queueQuery = useApprovalQueueQuery();
  const detailQuery = useApprovalDetailQuery(props.selectedApprovalRequestId);
  const decisionMutation = useApprovalDecisionMutation();
  const [comment, setComment] = useState('');

  async function submitDecision(decision: 'approved' | 'rejected') {
    if (!props.selectedApprovalRequestId) return;
    await decisionMutation.mutateAsync({
      approvalRequestId: props.selectedApprovalRequestId,
      decision,
      comment: comment.trim() || undefined,
    });
    setComment('');
  }

  return (
    <div data-ui="stack" data-direction="col" data-gap="4" className="console-route-layout">
      <PanelCard
        title="Approval Inbox"
        description="Queue-centric review surface for pending approval gates and their evidence bundles."
      >
        <div className="console-master-detail">
          <div data-ui="stack" data-direction="col" data-gap="3">
            {queueQuery.isLoading ? <LoadingPanel label="Loading approvals" /> : null}
            {queueQuery.error ? <ErrorPanel error={queueQuery.error} /> : null}
            {queueQuery.data && queueQuery.data.approvals.length === 0 ? (
              <EmptyPanel title="Approval queue is clear" body="No approval records are currently available." />
            ) : null}
            <div data-ui="list" data-variant="cards" data-density="comfortable" className="console-sidebar-list">
              {queueQuery.data?.approvals.map((approval) => (
                <div key={approval.approvalRequestId}>
                  <div data-ui="stack" data-direction="col" data-gap="2">
                    <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                      <div data-slot="start">
                        <Link
                          to="/approvals/$approvalRequestId"
                          params={{ approvalRequestId: approval.approvalRequestId }}
                          data-ui="link"
                        >
                          {approval.workflowKey}
                        </Link>
                      </div>
                      <div data-slot="end">
                        <span data-ui="badge" data-variant="subtle" data-tone="neutral">
                          {formatApprovalLabel(approval.status)}
                        </span>
                      </div>
                    </div>
                    <span data-ui="text" data-variant="caption" data-tone="secondary">
                      {approval.nodeKey || 'approval gate'} · {approval.requestedActorId || 'unassigned approver'}
                    </span>
                    <span data-ui="text" data-variant="caption" data-tone="muted">
                      artifacts: {approval.artifactTypes.join(', ') || 'none'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="console-detail-scroll">
            {!props.selectedApprovalRequestId ? (
              <EmptyPanel title="Choose an approval" body="Select an approval request from the left to inspect context and evidence." />
            ) : null}
            {props.selectedApprovalRequestId && detailQuery.isLoading ? <LoadingPanel label="Loading approval detail" /> : null}
            {detailQuery.error ? <ErrorPanel error={detailQuery.error} /> : null}
            {detailQuery.data ? (
              <div data-ui="stack" data-direction="col" data-gap="4">
                <SummaryGrid
                  items={[
                    { label: 'Approval', value: formatApprovalLabel(detailQuery.data.approval.status) },
                    { label: 'Run status', value: detailQuery.data.runSummary.status, helper: detailQuery.data.runSummary.workflowKey },
                    { label: 'Artifacts', value: detailQuery.data.artifacts.length },
                    { label: 'Requested actor', value: detailQuery.data.approval.requestedActorId || 'n/a' },
                  ]}
                />
                <RunSummaryHeader run={detailQuery.data.runSummary} />
                <PanelCard title="Decision action" description="Decision endpoint resolves approvalRequestId inside platform-api.">
                  <div data-ui="form" data-layout="vertical">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="approval-comment">Comment</label>
                      <textarea
                        id="approval-comment"
                        data-ui="textarea"
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        placeholder="Optional reviewer note"
                      />
                    </div>
                    {decisionMutation.error ? <ErrorPanel error={decisionMutation.error} /> : null}
                    <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                      <button
                        type="button"
                        data-ui="button"
                        data-size="md"
                        data-variant="primary"
                        disabled={decisionMutation.isPending}
                        onClick={() => void submitDecision('approved')}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        data-ui="button"
                        data-size="md"
                        data-variant="danger"
                        disabled={decisionMutation.isPending}
                        onClick={() => void submitDecision('rejected')}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </PanelCard>
                <PanelCard title="Approver context" description="Actor record resolved from the approval request.">
                  {detailQuery.data.approverContext ? (
                    <div data-ui="stack" data-direction="col" data-gap="2">
                      <span data-ui="text" data-variant="body" data-tone="primary">
                        {detailQuery.data.approverContext.displayName}
                      </span>
                      <span data-ui="text" data-variant="caption" data-tone="secondary">
                        {detailQuery.data.approverContext.actorId} · {detailQuery.data.approverContext.workspaceId}
                      </span>
                    </div>
                  ) : (
                    <EmptyPanel title="No actor profile" body="The runtime snapshot did not include a matching actor profile." />
                  )}
                </PanelCard>
                <PanelCard title="Evidence preview" description="Runtime artifacts referenced by the approval payload.">
                  <ArtifactEvidenceList artifacts={detailQuery.data.artifacts} />
                </PanelCard>
                <PanelCard title="Decision history" description={`Updated ${formatDateTime(detailQuery.data.approval.updatedAt)}`}>
                  <DecisionHistory decisions={detailQuery.data.decisions} />
                </PanelCard>
              </div>
            ) : null}
          </div>
        </div>
      </PanelCard>
    </div>
  );
}
