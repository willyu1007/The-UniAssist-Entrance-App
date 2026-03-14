import { Link } from '@tanstack/react-router';
import type {
  ApprovalRequestStatus,
  DraftRevisionRecord,
  DraftValidationSummary,
  WorkflowArtifactDetail,
  WorkflowApprovalDecisionRecord,
  WorkflowDraftRecord,
  WorkflowNodeRunRecord,
  WorkflowNodeSpec,
  WorkflowRunSnapshot,
  WorkflowRunSummary,
} from '@uniassist/workflow-contracts';
import { type ReactNode } from 'react';

export const NAV_ITEMS = [
  { to: '/templates', label: 'Templates' },
  { to: '/studio', label: 'Studio' },
  { to: '/agents', label: 'Agents' },
  { to: '/capabilities', label: 'Capabilities' },
  { to: '/governance', label: 'Governance' },
  { to: '/runs', label: 'Runs' },
] as const;

export function AppShell(props: {
  children: ReactNode;
  streamMode: string;
  sessionId: string;
  userId: string;
}) {
  return (
    <div className="console-shell">
      <div data-ui="page" data-density="comfortable">
        <div data-slot="header">
          <div data-ui="stack" data-direction="col" data-gap="4">
            <div data-ui="toolbar" data-align="between" data-wrap="wrap">
              <div data-slot="start">
                <div data-ui="stack" data-direction="col" data-gap="1">
                  <h1 data-ui="text" data-variant="h1" data-tone="primary">UniAssist Control Console</h1>
                  <p data-ui="text" data-variant="body" data-tone="secondary">
                    Pure-v1 operator surface for templates, agents, governance, and runtime investigation.
                  </p>
                </div>
              </div>
              <div data-slot="end">
                <span data-ui="badge" data-variant="subtle" data-tone="neutral">
                  stream: {props.streamMode}
                </span>
                <span data-ui="badge" data-variant="subtle" data-tone="neutral">
                  session: {props.sessionId}
                </span>
                <span data-ui="badge" data-variant="subtle" data-tone="neutral">
                  user: {props.userId}
                </span>
              </div>
            </div>
            <nav className="console-nav">
              <div data-ui="tabs">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    data-ui="tab"
                    activeProps={{ 'data-state': 'active' }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </nav>
          </div>
        </div>
        <div className="console-shell__body">{props.children}</div>
      </div>
    </div>
  );
}

export function PanelCard(props: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section data-ui="card" data-padding="lg" data-variant="default" data-elevation="sm">
      <div data-slot="header">
        <div data-ui="stack" data-direction="col" data-gap="1">
          <h2 data-ui="text" data-variant="h3" data-tone="primary">{props.title}</h2>
          {props.description ? (
            <p data-ui="text" data-variant="body" data-tone="secondary">{props.description}</p>
          ) : null}
        </div>
      </div>
      {props.children}
      {props.footer ? <div data-slot="footer">{props.footer}</div> : null}
    </section>
  );
}

export function EmptyPanel(props: { title: string; body: string }) {
  return (
    <div data-ui="empty-state">
      <div data-slot="title">{props.title}</div>
      <div data-slot="body">{props.body}</div>
    </div>
  );
}

export function ErrorPanel(props: { title?: string; error: unknown }) {
  const message = props.error instanceof Error ? props.error.message : String(props.error);
  return (
    <div data-ui="alert" data-tone="danger">
      <div data-slot="title">{props.title || 'Request failed'}</div>
      <p data-ui="text" data-variant="body" data-tone="danger">{message}</p>
    </div>
  );
}

export function LoadingPanel(props: { label?: string }) {
  return (
    <PanelCard title={props.label || 'Loading'} description="Fetching latest state from platform-api.">
      <p data-ui="text" data-variant="body" data-tone="secondary">Please wait.</p>
    </PanelCard>
  );
}

export function SummaryStat(props: { label: string; value: ReactNode; helper?: string }) {
  return (
    <div data-ui="card" data-padding="md" data-variant="outlined" data-elevation="none">
      <div data-ui="stack" data-direction="col" data-gap="1">
        <span data-ui="text" data-variant="label" data-tone="secondary">{props.label}</span>
        <span data-ui="text" data-variant="h3" data-tone="primary">{props.value}</span>
        {props.helper ? (
          <span data-ui="text" data-variant="caption" data-tone="muted">{props.helper}</span>
        ) : null}
      </div>
    </div>
  );
}

export function SummaryGrid(props: { items: Array<{ label: string; value: ReactNode; helper?: string }> }) {
  return (
    <div data-ui="grid" data-gap="3" className="console-card-grid">
      {props.items.map((item) => (
        <SummaryStat key={item.label} {...item} />
      ))}
    </div>
  );
}

export function JsonPreview(props: { label?: string; value: unknown }) {
  return (
    <div data-ui="stack" data-direction="col" data-gap="2">
      {props.label ? (
        <span data-ui="text" data-variant="label" data-tone="secondary">{props.label}</span>
      ) : null}
      <pre data-ui="card" data-padding="md" data-variant="outlined" data-elevation="none" className="console-pre">
        {formatJson(props.value)}
      </pre>
    </div>
  );
}

export function RunSummaryHeader(props: { run: WorkflowRunSummary }) {
  const run = props.run;
  return (
    <SummaryGrid
      items={[
        { label: 'Status', value: run.status, helper: run.currentNodeKey || 'no active node' },
        { label: 'Blocker', value: run.blocker || 'none', helper: `${run.pendingApprovalCount} pending approvals` },
        { label: 'Artifacts', value: run.artifactTypes.length, helper: run.artifactTypes.join(', ') || 'none' },
        { label: 'Delivered', value: run.deliverySummary.delivered, helper: `${run.deliverySummary.ready} ready / ${run.deliverySummary.blocked} blocked` },
      ]}
    />
  );
}

export function RunNodeProgressList(props: { nodeRuns: WorkflowNodeRunRecord[] }) {
  if (props.nodeRuns.length === 0) {
    return <EmptyPanel title="No node runs yet" body="This run has not produced any node progression." />;
  }
  return (
    <div data-ui="list" data-variant="rows" data-density="comfortable">
      {props.nodeRuns.map((nodeRun) => (
        <div key={nodeRun.nodeRunId}>
          <div data-ui="stack" data-direction="col" data-gap="2">
            <div data-ui="toolbar" data-align="between" data-wrap="wrap">
              <div data-slot="start">
                <strong data-ui="text" data-variant="body" data-tone="primary">{nodeRun.nodeKey}</strong>
                <span data-ui="badge" data-variant="subtle" data-tone="neutral">{nodeRun.status}</span>
              </div>
              <div data-slot="end">
                <span data-ui="text" data-variant="caption" data-tone="muted">{formatDateTime(nodeRun.updatedAt)}</span>
              </div>
            </div>
            <span data-ui="text" data-variant="caption" data-tone="secondary">
              {nodeRun.nodeType} · interaction {nodeRun.interactionRequestId || nodeRun.waitKey || 'n/a'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DraftValidationPanel(props: { summary?: DraftValidationSummary; publishable: boolean }) {
  if (!props.summary) {
    return <EmptyPanel title="Validation pending" body="Run validation to compute publishability, warnings, and errors." />;
  }
  return (
    <div data-ui="stack" data-direction="col" data-gap="3">
      <SummaryGrid
        items={[
          { label: 'Publishable', value: props.publishable ? 'yes' : 'no' },
          { label: 'Errors', value: props.summary.errors.length },
          { label: 'Warnings', value: props.summary.warnings.length },
          { label: 'Checked', value: formatDateTime(props.summary.checkedAt) },
        ]}
      />
      {props.summary.errors.length > 0 ? (
        <div data-ui="alert" data-tone="danger">
          <div data-slot="title">Blocking issues</div>
          <ul data-ui="list">
            {props.summary.errors.map((error) => (
              <li key={error}>
                <span data-ui="text" data-variant="body" data-tone="danger">{error}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {props.summary.warnings.length > 0 ? (
        <PanelCard title="Warnings" description="Non-blocking signals carried on the latest validation revision.">
          <ul data-ui="list">
            {props.summary.warnings.map((warning) => (
              <li key={warning}>
                <span data-ui="text" data-variant="body" data-tone="secondary">{warning}</span>
              </li>
            ))}
          </ul>
        </PanelCard>
      ) : null}
    </div>
  );
}

export function RevisionComparePanel(props: {
  draft: WorkflowDraftRecord;
  revisions: DraftRevisionRecord[];
  selectedRevisionId?: string;
  onSelectRevision: (revisionId: string) => void;
}) {
  const currentRevision = props.revisions.find((item) => item.revisionId === props.selectedRevisionId) || props.revisions.at(-1);
  const previousRevision = currentRevision
    ? props.revisions.find((item) => item.revisionNumber === currentRevision.revisionNumber - 1)
    : undefined;

  return (
    <div data-ui="stack" data-direction="col" data-gap="4">
      <div data-ui="field">
        <label data-slot="label" htmlFor="revision-select">Revision compare</label>
        <select
          id="revision-select"
          data-ui="select"
          data-size="md"
          value={currentRevision?.revisionId || ''}
          onChange={(event) => props.onSelectRevision(event.target.value)}
        >
          {props.revisions.map((revision) => (
            <option key={revision.revisionId} value={revision.revisionId}>
              r{revision.revisionNumber} · {revision.source} · {revision.changeSummary}
            </option>
          ))}
        </select>
      </div>
      <div data-ui="grid" data-gap="4" className="console-two-up">
        <PanelCard
          title={previousRevision ? `Revision ${previousRevision.revisionNumber}` : 'Previous revision'}
          description={previousRevision ? previousRevision.changeSummary : 'No prior revision available.'}
        >
          <JsonPreview value={previousRevision?.specSnapshot || props.draft.currentSpec} />
        </PanelCard>
        <PanelCard
          title={currentRevision ? `Revision ${currentRevision.revisionNumber}` : 'Current revision'}
          description={currentRevision ? currentRevision.changeSummary : 'Current draft snapshot.'}
        >
          <JsonPreview value={currentRevision?.specSnapshot || props.draft.currentSpec} />
        </PanelCard>
      </div>
    </div>
  );
}

export function ArtifactEvidenceList(props: { artifacts: WorkflowArtifactDetail[] }) {
  if (props.artifacts.length === 0) {
    return <EmptyPanel title="No evidence attached" body="This approval does not reference any evidence artifacts." />;
  }
  return (
    <div data-ui="list" data-variant="cards" data-density="comfortable">
      {props.artifacts.map((artifact) => (
        <div key={artifact.artifact.artifactId}>
          <div data-ui="stack" data-direction="col" data-gap="3">
            <div data-ui="toolbar" data-align="between" data-wrap="wrap">
              <div data-slot="start">
                <strong data-ui="text" data-variant="body" data-tone="primary">{artifact.artifact.artifactType}</strong>
                <span data-ui="badge" data-variant="subtle" data-tone="neutral">{artifact.artifact.state}</span>
              </div>
              <div data-slot="end">
                <span data-ui="text" data-variant="caption" data-tone="muted">{artifact.artifact.artifactId}</span>
              </div>
            </div>
            <JsonPreview label="Payload" value={artifact.typedPayload} />
            <JsonPreview label="Lineage" value={artifact.lineage} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DecisionHistory(props: { decisions: WorkflowApprovalDecisionRecord[] }) {
  if (props.decisions.length === 0) {
    return <EmptyPanel title="No decisions yet" body="The approval request is still awaiting a recorded decision." />;
  }
  return (
    <div data-ui="list" data-variant="rows" data-density="comfortable">
      {props.decisions.map((decision) => (
        <div key={decision.approvalDecisionId}>
          <div data-ui="toolbar" data-align="between" data-wrap="wrap">
            <div data-slot="start">
              <strong data-ui="text" data-variant="body" data-tone="primary">{decision.decision}</strong>
              <span data-ui="text" data-variant="caption" data-tone="secondary">{decision.decidedActorId}</span>
            </div>
            <div data-slot="end">
              <span data-ui="text" data-variant="caption" data-tone="muted">{formatDateTime(decision.createdAt)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DraftLineageList(props: { revisions: DraftRevisionRecord[] }) {
  if (props.revisions.length === 0) {
    return <EmptyPanel title="No lineage revisions" body="Draft revision history is missing." />;
  }
  return (
    <div data-ui="list" data-variant="rows" data-density="comfortable">
      {props.revisions.map((revision) => (
        <div key={revision.revisionId}>
          <div data-ui="toolbar" data-align="between" data-wrap="wrap">
            <div data-slot="start">
              <strong data-ui="text" data-variant="body" data-tone="primary">
                r{revision.revisionNumber} · {revision.source}
              </strong>
            </div>
            <div data-slot="end">
              <span data-ui="text" data-variant="caption" data-tone="muted">
                {formatDateTime(revision.createdAt)}
              </span>
            </div>
          </div>
          <p data-ui="text" data-variant="caption" data-tone="secondary">{revision.changeSummary}</p>
        </div>
      ))}
    </div>
  );
}

export function DraftDagPreview(props: { entryNode?: string; nodes?: WorkflowNodeSpec[] }) {
  const nodes = props.nodes || [];
  if (nodes.length === 0) {
    return <EmptyPanel title="Graph unavailable" body="Synthesize or patch node definitions to preview the DAG." />;
  }
  return (
    <div data-ui="grid" data-gap="3" className="console-dag">
      {nodes.map((node) => (
        <div key={node.nodeKey} data-ui="card" data-padding="md" data-variant="outlined" data-elevation="none">
          <div data-ui="stack" data-direction="col" data-gap="2">
            <div data-ui="toolbar" data-align="between" data-wrap="wrap">
              <div data-slot="start">
                <strong data-ui="text" data-variant="body" data-tone="primary">{node.nodeKey}</strong>
              </div>
              <div data-slot="end">
                {props.entryNode === node.nodeKey ? (
                  <span data-ui="badge" data-variant="subtle" data-tone="neutral">entry</span>
                ) : null}
              </div>
            </div>
            <span data-ui="text" data-variant="caption" data-tone="secondary">{node.nodeType}</span>
            <JsonPreview label="Transitions" value={node.transitions || {}} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function formatDateTime(timestamp?: number): string {
  if (!timestamp) return 'n/a';
  return new Date(timestamp).toLocaleString();
}

export function formatApprovalLabel(status: ApprovalRequestStatus): string {
  return status.replace(/_/g, ' ');
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function describeDeliverySummary(run: WorkflowRunSummary): string {
  const delivery = run.deliverySummary;
  return [
    `ready ${delivery.ready}`,
    `blocked ${delivery.blocked}`,
    `delivered ${delivery.delivered}`,
    `failed ${delivery.failed}`,
  ].join(' · ');
}

export function describeRunBlockers(run: WorkflowRunSnapshot): string {
  if (run.run.status === 'waiting_approval') {
    return `${run.approvals.filter((item) => item.status === 'pending').length} approval gates pending`;
  }
  if (run.run.status === 'waiting_interaction') {
    return 'waiting for interaction response';
  }
  if (run.run.status === 'failed') {
    return 'run failed before reaching terminal delivery';
  }
  return 'no blocking condition';
}
