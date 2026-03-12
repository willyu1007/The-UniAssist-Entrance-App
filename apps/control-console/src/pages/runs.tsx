import { Link } from '@tanstack/react-router';
import {
  describeDeliverySummary,
  describeRunBlockers,
  EmptyPanel,
  ErrorPanel,
  formatDateTime,
  LoadingPanel,
  PanelCard,
  RunNodeProgressList,
  RunSummaryHeader,
} from '../components';
import { useRunQuery, useRunsQuery } from '../query';

export function RunsWorkspace(props: { selectedRunId?: string }) {
  const runsQuery = useRunsQuery(40);
  const runQuery = useRunQuery(props.selectedRunId);

  return (
    <div data-ui="stack" data-direction="col" data-gap="4" className="console-route-layout">
      <PanelCard
        title="Runboard"
        description="Recent-first workflow runs with blocker, node progression, and delivery state."
      >
        <div className="console-master-detail">
          <div data-ui="stack" data-direction="col" data-gap="3">
            {runsQuery.isLoading ? <LoadingPanel label="Loading runs" /> : null}
            {runsQuery.error ? <ErrorPanel error={runsQuery.error} /> : null}
            {runsQuery.data && runsQuery.data.runs.length === 0 ? (
              <EmptyPanel title="No runs found" body="Start a workflow run from the platform to populate the runboard." />
            ) : null}
            <div data-ui="list" data-variant="cards" data-density="comfortable" className="console-sidebar-list">
              {runsQuery.data?.runs.map((run) => (
                <div key={run.runId}>
                  <div data-ui="stack" data-direction="col" data-gap="2">
                    <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                      <div data-slot="start">
                        <Link to="/runs/$runId" params={{ runId: run.runId }} data-ui="link">
                          {run.workflowKey}
                        </Link>
                      </div>
                      <div data-slot="end">
                        <span data-ui="badge" data-variant="subtle" data-tone="neutral">{run.status}</span>
                      </div>
                    </div>
                    <span data-ui="text" data-variant="caption" data-tone="secondary">
                      {run.currentNodeKey || 'no active node'} · {formatDateTime(run.updatedAt)}
                    </span>
                    <span data-ui="text" data-variant="caption" data-tone="muted">
                      {describeDeliverySummary(run)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="console-detail-scroll">
            {!props.selectedRunId ? (
              <EmptyPanel title="Choose a run" body="Select a run from the left column to inspect its progression." />
            ) : null}
            {props.selectedRunId && runQuery.isLoading ? <LoadingPanel label="Loading run detail" /> : null}
            {runQuery.error ? <ErrorPanel error={runQuery.error} /> : null}
            {runQuery.data ? (
              <div data-ui="stack" data-direction="col" data-gap="4">
                <RunSummaryHeader
                  run={{
                    ...runQuery.data.run.run,
                    workflowId: runQuery.data.run.run.workflowId,
                    workflowKey: runQuery.data.run.run.workflowKey,
                    templateVersionId: runQuery.data.run.run.templateVersionId,
                    compatProviderId: runQuery.data.run.run.compatProviderId,
                    currentNodeRunId: runQuery.data.run.run.currentNodeRunId,
                    currentNodeKey: runQuery.data.run.nodeRuns.find((item) => item.nodeRunId === runQuery.data.run.run.currentNodeRunId)?.nodeKey,
                    currentNodeType: runQuery.data.run.nodeRuns.find((item) => item.nodeRunId === runQuery.data.run.run.currentNodeRunId)?.nodeType,
                    currentNodeStatus: runQuery.data.run.nodeRuns.find((item) => item.nodeRunId === runQuery.data.run.run.currentNodeRunId)?.status,
                    blocker: runQuery.data.run.run.status === 'waiting_approval'
                      ? 'waiting_approval'
                      : runQuery.data.run.run.status === 'waiting_input'
                        ? 'waiting_input'
                        : runQuery.data.run.run.status === 'failed'
                          ? 'failed'
                          : runQuery.data.run.run.status === 'paused'
                            ? 'paused'
                            : null,
                    pendingApprovalCount: runQuery.data.run.approvals.filter((item) => item.status === 'pending').length,
                    deliverySummary: {
                      pendingResolution: runQuery.data.run.deliveryTargets.filter((item) => item.status === 'pending_resolution').length,
                      ready: runQuery.data.run.deliveryTargets.filter((item) => item.status === 'ready').length,
                      blocked: runQuery.data.run.deliveryTargets.filter((item) => item.status === 'blocked').length,
                      delivered: runQuery.data.run.deliveryTargets.filter((item) => item.status === 'delivered').length,
                      failed: runQuery.data.run.deliveryTargets.filter((item) => item.status === 'failed').length,
                      cancelled: runQuery.data.run.deliveryTargets.filter((item) => item.status === 'cancelled').length,
                    },
                    artifactTypes: [...new Set(runQuery.data.run.artifacts.map((item) => item.artifactType))],
                    requestedActorIds: runQuery.data.run.approvals.map((item) => item.requestedActorId).filter(Boolean) as string[],
                  }}
                />
                <PanelCard title="Blockers" description={describeRunBlockers(runQuery.data.run)}>
                  <div data-ui="stack" data-direction="col" data-gap="2">
                    <span data-ui="text" data-variant="body" data-tone="secondary">
                      Current node: {runQuery.data.run.nodeRuns.find((item) => item.nodeRunId === runQuery.data.run.run.currentNodeRunId)?.nodeKey || 'n/a'}
                    </span>
                    <span data-ui="text" data-variant="body" data-tone="secondary">
                      Pending approvals: {runQuery.data.run.approvals.filter((item) => item.status === 'pending').length}
                    </span>
                    <span data-ui="text" data-variant="body" data-tone="secondary">
                      Delivery targets: {runQuery.data.run.deliveryTargets.length}
                    </span>
                  </div>
                </PanelCard>
                <PanelCard title="Node progression" description="Ordered node state snapshots for the selected run.">
                  <RunNodeProgressList nodeRuns={runQuery.data.run.nodeRuns} />
                </PanelCard>
                <PanelCard title="Artifacts" description="Artifacts and derived recipe drafts attached to this run.">
                  <div data-ui="stack" data-direction="col" data-gap="3">
                    {runQuery.data.run.artifacts.length === 0 ? (
                      <EmptyPanel title="No artifacts" body="This run has not produced artifacts yet." />
                    ) : (
                      <div data-ui="list" data-variant="rows" data-density="comfortable">
                        {runQuery.data.run.artifacts.map((artifact) => (
                          <div key={artifact.artifactId}>
                            <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                              <div data-slot="start">
                                <strong data-ui="text" data-variant="body" data-tone="primary">{artifact.artifactType}</strong>
                                <span data-ui="badge" data-variant="subtle" data-tone="neutral">{artifact.state}</span>
                              </div>
                              <div data-slot="end">
                                <span data-ui="text" data-variant="caption" data-tone="muted">{artifact.artifactId}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {runQuery.data.capturedRecipeDrafts && runQuery.data.capturedRecipeDrafts.length > 0 ? (
                      <div data-ui="list" data-variant="rows" data-density="comfortable">
                        {runQuery.data.capturedRecipeDrafts.map((recipeDraft) => (
                          <div key={recipeDraft.recipeDraftId}>
                            <span data-ui="text" data-variant="body" data-tone="primary">
                              recipe draft · {recipeDraft.title || recipeDraft.recipeDraftId}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </PanelCard>
              </div>
            ) : null}
          </div>
        </div>
      </PanelCard>
    </div>
  );
}
