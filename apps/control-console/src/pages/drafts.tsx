import { useEffect, useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import {
  DraftLineageList,
  DraftValidationPanel,
  EmptyPanel,
  ErrorPanel,
  formatDateTime,
  LoadingPanel,
  PanelCard,
  RevisionComparePanel,
  SummaryGrid,
} from '../components';
import { useControlConsoleEnvironment, useDraftDetailQuery, useDraftListQuery, useFocusDraftMutation } from '../query';

export function DraftsWorkspace(props: { selectedDraftId?: string }) {
  const { identity } = useControlConsoleEnvironment();
  const navigate = useNavigate();
  const draftsQuery = useDraftListQuery('all');
  const detailQuery = useDraftDetailQuery(props.selectedDraftId, identity.sessionId);
  const focusMutation = useFocusDraftMutation();
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | undefined>();

  useEffect(() => {
    if (detailQuery.data?.revisions.length) {
      setSelectedRevisionId(detailQuery.data.revisions.at(-1)?.revisionId);
    }
  }, [detailQuery.data?.revisions]);

  async function openInStudio(): Promise<void> {
    if (!props.selectedDraftId) return;
    await focusMutation.mutateAsync({ draftId: props.selectedDraftId });
    await navigate({ to: '/studio/$draftId', params: { draftId: props.selectedDraftId } });
  }

  return (
    <div data-ui="stack" data-direction="col" data-gap="4" className="console-route-layout">
      <PanelCard
        title="Draft Inspector"
        description="Lineage, validation, publishability, and revision compare for workflow drafts."
      >
        <div className="console-master-detail">
          <div data-ui="stack" data-direction="col" data-gap="3">
            {draftsQuery.isLoading ? <LoadingPanel label="Loading drafts" /> : null}
            {draftsQuery.error ? <ErrorPanel error={draftsQuery.error} /> : null}
            {draftsQuery.data && draftsQuery.data.drafts.length === 0 ? (
              <EmptyPanel title="No drafts found" body="Create or focus a draft from Workflow Studio to inspect it here." />
            ) : null}
            <div data-ui="list" data-variant="cards" data-density="comfortable" className="console-sidebar-list">
              {draftsQuery.data?.drafts.map((draft) => (
                <div key={draft.draftId}>
                  <div data-ui="stack" data-direction="col" data-gap="2">
                    <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                      <div data-slot="start">
                        <Link to="/drafts/$draftId" params={{ draftId: draft.draftId }} data-ui="link">
                          {draft.name || draft.workflowKey || draft.draftId}
                        </Link>
                      </div>
                      <div data-slot="end">
                        <span data-ui="badge" data-variant="subtle" data-tone="neutral">{draft.status}</span>
                      </div>
                    </div>
                    <span data-ui="text" data-variant="caption" data-tone="secondary">
                      revision {draft.activeRevisionNumber} · {formatDateTime(draft.updatedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="console-detail-scroll">
            {!props.selectedDraftId ? (
              <EmptyPanel title="Choose a draft" body="Select a workflow draft to inspect revision lineage and validation." />
            ) : null}
            {props.selectedDraftId && detailQuery.isLoading ? <LoadingPanel label="Loading draft detail" /> : null}
            {detailQuery.error ? <ErrorPanel error={detailQuery.error} /> : null}
            {detailQuery.data ? (
              <div data-ui="stack" data-direction="col" data-gap="4">
                <SummaryGrid
                  items={[
                    { label: 'Status', value: detailQuery.data.draft.status },
                    { label: 'Publishable', value: detailQuery.data.draft.publishable ? 'yes' : 'no' },
                    { label: 'Revisions', value: detailQuery.data.revisions.length },
                    { label: 'Published version', value: detailQuery.data.draft.publishedTemplateVersionId || 'n/a' },
                  ]}
                />
                <PanelCard
                  title="Draft profile"
                  description={`${detailQuery.data.draft.workflowKey || 'unkeyed draft'} · updated ${formatDateTime(detailQuery.data.draft.updatedAt)}`}
                  footer={(
                    <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                      <button
                        type="button"
                        data-ui="button"
                        data-size="md"
                        data-variant="secondary"
                        disabled={focusMutation.isPending}
                        onClick={() => void openInStudio()}
                      >
                        Open in Studio
                      </button>
                    </div>
                  )}
                >
                  <div data-ui="stack" data-direction="col" data-gap="2">
                    <span data-ui="text" data-variant="body" data-tone="primary">
                      {detailQuery.data.draft.name || 'Untitled draft'}
                    </span>
                    <span data-ui="text" data-variant="caption" data-tone="secondary">
                      current session links: {detailQuery.data.sessionLinks.length}
                    </span>
                  </div>
                </PanelCard>
                <PanelCard title="Validation summary" description="Publishability and validation outputs from the latest revision.">
                  <DraftValidationPanel
                    summary={detailQuery.data.draft.latestValidationSummary}
                    publishable={detailQuery.data.draft.publishable}
                  />
                </PanelCard>
                <PanelCard title="Lineage" description="Chronological revision sources and summaries.">
                  <DraftLineageList revisions={detailQuery.data.revisions} />
                </PanelCard>
                <PanelCard title="Revision compare" description="Embedded snapshot compare for the selected revision.">
                  <RevisionComparePanel
                    draft={detailQuery.data.draft}
                    revisions={detailQuery.data.revisions}
                    selectedRevisionId={selectedRevisionId}
                    onSelectRevision={setSelectedRevisionId}
                  />
                </PanelCard>
              </div>
            ) : null}
          </div>
        </div>
      </PanelCard>
    </div>
  );
}
