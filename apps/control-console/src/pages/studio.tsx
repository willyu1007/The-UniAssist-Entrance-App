import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import type { WorkflowNodeSpec } from '@uniassist/workflow-contracts';
import {
  DraftDagPreview,
  DraftValidationPanel,
  EmptyPanel,
  ErrorPanel,
  formatDateTime,
  JsonPreview,
  LoadingPanel,
  PanelCard,
  SummaryGrid,
} from '../components';
import {
  useControlConsoleEnvironment,
  useCreateDraftMutation,
  useDraftDetailQuery,
  useDraftIntakeMutation,
  useDraftListQuery,
  useDraftPatchMutation,
  useDraftPublishMutation,
  useDraftSynthesizeMutation,
  useDraftValidateMutation,
  useFocusDraftMutation,
} from '../query';

function normalizeRequirements(text: string): string[] {
  return text
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeParseNodes(text: string): WorkflowNodeSpec[] {
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('nodes JSON must be an array');
  }
  return parsed as WorkflowNodeSpec[];
}

export function StudioWorkspace(props: { selectedDraftId?: string }) {
  const { identity } = useControlConsoleEnvironment();
  const navigate = useNavigate();
  const sessionDraftsQuery = useDraftListQuery(identity.sessionId);
  const detailQuery = useDraftDetailQuery(props.selectedDraftId, identity.sessionId);
  const createDraftMutation = useCreateDraftMutation();
  const focusDraftMutation = useFocusDraftMutation();
  const intakeMutation = useDraftIntakeMutation();
  const synthesizeMutation = useDraftSynthesizeMutation();
  const validateMutation = useDraftValidateMutation();
  const patchMutation = useDraftPatchMutation();
  const publishMutation = useDraftPublishMutation();

  const [workflowKey, setWorkflowKey] = useState('');
  const [name, setName] = useState('');
  const [initialText, setInitialText] = useState('');
  const [metadataWorkflowKey, setMetadataWorkflowKey] = useState('');
  const [metadataName, setMetadataName] = useState('');
  const [metadataEntryNode, setMetadataEntryNode] = useState('');
  const [requirementsText, setRequirementsText] = useState('');
  const [nodesText, setNodesText] = useState('[]');
  const [nodesError, setNodesError] = useState<string | undefined>();
  const [changeSummary, setChangeSummary] = useState('');
  const [intakeText, setIntakeText] = useState('');

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) return;
    setMetadataWorkflowKey(detail.draft.currentSpec.workflowKey || '');
    setMetadataName(detail.draft.currentSpec.name || '');
    setMetadataEntryNode(detail.draft.currentSpec.entryNode || '');
    setRequirementsText((detail.draft.currentSpec.requirements || []).join('\n'));
    setNodesText(JSON.stringify(detail.draft.currentSpec.nodes || [], null, 2));
    setNodesError(undefined);
  }, [detailQuery.data?.draft.updatedAt]);

  useEffect(() => {
    const detail = detailQuery.data;
    if (!props.selectedDraftId || !detail || focusDraftMutation.isPending) {
      return;
    }
    const linked = detail.sessionLinks.some((item) => item.draftId === props.selectedDraftId);
    if (linked) {
      return;
    }
    void focusDraftMutation.mutateAsync({ draftId: props.selectedDraftId });
  }, [detailQuery.data?.sessionLinks, focusDraftMutation, props.selectedDraftId]);

  async function createDraft(): Promise<void> {
    const response = await createDraftMutation.mutateAsync({
      workflowKey: workflowKey.trim() || undefined,
      name: name.trim() || undefined,
      initialText: initialText.trim() || undefined,
      source: initialText.trim() ? 'builder_text_entry' : 'builder_quick_entry',
    });
    setInitialText('');
    await navigate({ to: '/studio/$draftId', params: { draftId: response.draft.draftId } });
  }

  async function saveMetadata(): Promise<void> {
    if (!props.selectedDraftId || !detailQuery.data) return;
    await patchMutation.mutateAsync({
      draftId: props.selectedDraftId,
      body: {
        baseRevisionId: detailQuery.data.revisions.at(-1)?.revisionId || '',
        changeSummary: changeSummary.trim() || 'Updated draft metadata from workflow studio',
        patch: {
          section: 'metadata',
          value: {
            workflowKey: metadataWorkflowKey.trim() || undefined,
            name: metadataName.trim() || undefined,
            entryNode: metadataEntryNode.trim() || undefined,
          },
        },
      },
    });
    setChangeSummary('');
  }

  async function saveRequirements(): Promise<void> {
    if (!props.selectedDraftId || !detailQuery.data) return;
    await patchMutation.mutateAsync({
      draftId: props.selectedDraftId,
      body: {
        baseRevisionId: detailQuery.data.revisions.at(-1)?.revisionId || '',
        changeSummary: changeSummary.trim() || 'Updated workflow requirements from workflow studio',
        patch: {
          section: 'requirements',
          value: {
            requirements: normalizeRequirements(requirementsText),
          },
        },
      },
    });
    setChangeSummary('');
  }

  async function saveNodes(): Promise<void> {
    if (!props.selectedDraftId || !detailQuery.data) return;
    let nodes: WorkflowNodeSpec[];
    try {
      nodes = safeParseNodes(nodesText);
      setNodesError(undefined);
    } catch (error) {
      setNodesError(error instanceof Error ? error.message : 'nodes JSON is invalid');
      return;
    }
    await patchMutation.mutateAsync({
      draftId: props.selectedDraftId,
      body: {
        baseRevisionId: detailQuery.data.revisions.at(-1)?.revisionId || '',
        changeSummary: changeSummary.trim() || 'Updated workflow node graph from workflow studio',
        patch: {
          section: 'nodes',
          value: {
            entryNode: metadataEntryNode.trim() || undefined,
            nodes,
          },
        },
      },
    });
    setChangeSummary('');
  }

  async function submitIntake(): Promise<void> {
    if (!props.selectedDraftId || !intakeText.trim()) return;
    await intakeMutation.mutateAsync({
      draftId: props.selectedDraftId,
      text: intakeText.trim(),
    });
    setIntakeText('');
  }

  async function publishDraft(): Promise<void> {
    if (!props.selectedDraftId) return;
    await publishMutation.mutateAsync({ draftId: props.selectedDraftId });
  }

  return (
    <div data-ui="stack" data-direction="col" data-gap="4" className="console-route-layout">
      <PanelCard
        title="Workflow Studio"
        description="Spec-first editing, validation, publish, helper input, and read-only DAG preview."
      >
        <div className="console-studio-layout">
          <div data-ui="stack" data-direction="col" data-gap="3">
            <PanelCard title="Create draft" description="Start a new workflow draft in the current console session.">
              <div data-ui="form" data-layout="vertical">
                <div data-ui="field">
                  <label data-slot="label" htmlFor="create-workflow-key">Workflow key</label>
                  <input
                    id="create-workflow-key"
                    data-ui="input"
                    data-size="md"
                    value={workflowKey}
                    onChange={(event) => setWorkflowKey(event.target.value)}
                  />
                </div>
                <div data-ui="field">
                  <label data-slot="label" htmlFor="create-name">Name</label>
                  <input
                    id="create-name"
                    data-ui="input"
                    data-size="md"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div data-ui="field">
                  <label data-slot="label" htmlFor="create-initial-text">Initial assistant input</label>
                  <textarea
                    id="create-initial-text"
                    data-ui="textarea"
                    value={initialText}
                    onChange={(event) => setInitialText(event.target.value)}
                  />
                </div>
                {createDraftMutation.error ? <ErrorPanel error={createDraftMutation.error} /> : null}
                <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                  <button
                    type="button"
                    data-ui="button"
                    data-size="md"
                    data-variant="primary"
                    disabled={createDraftMutation.isPending}
                    onClick={() => void createDraft()}
                  >
                    Create draft
                  </button>
                </div>
              </div>
            </PanelCard>

            <PanelCard title="Session drafts" description="Drafts currently linked to this console session.">
              {sessionDraftsQuery.isLoading ? <LoadingPanel label="Loading session drafts" /> : null}
              {sessionDraftsQuery.error ? <ErrorPanel error={sessionDraftsQuery.error} /> : null}
              {sessionDraftsQuery.data && sessionDraftsQuery.data.drafts.length === 0 ? (
                <EmptyPanel title="No active session drafts" body="Create or focus a draft to edit it from this studio session." />
              ) : null}
              <div data-ui="list" data-variant="rows" data-density="comfortable" className="console-sidebar-list">
                {sessionDraftsQuery.data?.drafts.map((draft) => (
                  <div key={draft.draftId}>
                    <div data-ui="stack" data-direction="col" data-gap="2">
                      <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                        <div data-slot="start">
                          <Link to="/studio/$draftId" params={{ draftId: draft.draftId }} data-ui="link">
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
            </PanelCard>
          </div>

          <div className="console-detail-scroll">
            {!props.selectedDraftId ? (
              <EmptyPanel title="Choose a studio draft" body="Select a session draft or create a new one to edit workflow spec sections." />
            ) : null}
            {props.selectedDraftId && detailQuery.isLoading ? <LoadingPanel label="Loading studio draft" /> : null}
            {detailQuery.error ? <ErrorPanel error={detailQuery.error} /> : null}
            {detailQuery.data ? (
              <div data-ui="stack" data-direction="col" data-gap="4">
                <SummaryGrid
                  items={[
                    { label: 'Draft', value: detailQuery.data.draft.name || detailQuery.data.draft.draftId },
                    { label: 'Status', value: detailQuery.data.draft.status },
                    { label: 'Revision', value: detailQuery.data.draft.activeRevisionNumber },
                    { label: 'Session links', value: detailQuery.data.sessionLinks.length },
                  ]}
                />
                {publishMutation.data ? (
                  <PanelCard title="Publish output" description="Use the published version for templates browse or agent promotion.">
                    <div data-ui="stack" data-direction="col" data-gap="2">
                      <span data-ui="text" data-variant="body" data-tone="primary">
                        Published template {publishMutation.data.workflow.name} as version {publishMutation.data.version.version}.
                      </span>
                      <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                        <Link
                          to="/templates/$workflowId"
                          params={{ workflowId: publishMutation.data.workflow.workflowId }}
                          data-ui="link"
                        >
                          Open template
                        </Link>
                        <Link
                          to="/agents/from-template/$templateVersionRef"
                          params={{ templateVersionRef: publishMutation.data.version.templateVersionId }}
                          data-ui="link"
                        >
                          Create agent from version
                        </Link>
                      </div>
                    </div>
                  </PanelCard>
                ) : null}
                <PanelCard title="Metadata patch" description="Structured section patch for workflow key, name, and entry node.">
                  <div data-ui="form" data-layout="vertical">
                    <div className="console-two-up">
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="metadata-workflow-key">Workflow key</label>
                        <input
                          id="metadata-workflow-key"
                          data-ui="input"
                          data-size="md"
                          value={metadataWorkflowKey}
                          onChange={(event) => setMetadataWorkflowKey(event.target.value)}
                        />
                      </div>
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="metadata-name">Name</label>
                        <input
                          id="metadata-name"
                          data-ui="input"
                          data-size="md"
                          value={metadataName}
                          onChange={(event) => setMetadataName(event.target.value)}
                        />
                      </div>
                    </div>
                    <div className="console-two-up">
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="metadata-entry-node">Entry node</label>
                        <input
                          id="metadata-entry-node"
                          data-ui="input"
                          data-size="md"
                          value={metadataEntryNode}
                          onChange={(event) => setMetadataEntryNode(event.target.value)}
                        />
                      </div>
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="change-summary">Change summary</label>
                      <input
                        id="change-summary"
                        data-ui="input"
                        data-size="md"
                        value={changeSummary}
                        onChange={(event) => setChangeSummary(event.target.value)}
                        placeholder="Optional; default summary is section-specific"
                      />
                    </div>
                    {patchMutation.error ? <ErrorPanel error={patchMutation.error} /> : null}
                    <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                      <button
                        type="button"
                        data-ui="button"
                        data-size="md"
                        data-variant="primary"
                        disabled={patchMutation.isPending}
                        onClick={() => void saveMetadata()}
                      >
                        Save metadata
                      </button>
                    </div>
                  </div>
                </PanelCard>
                <PanelCard title="Requirements patch" description="Console editor writes requirement sections as explicit structured lists.">
                  <div data-ui="form" data-layout="vertical">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="requirements-text">Requirements</label>
                      <textarea
                        id="requirements-text"
                        data-ui="textarea"
                        value={requirementsText}
                        onChange={(event) => setRequirementsText(event.target.value)}
                      />
                    </div>
                    <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                      <button
                        type="button"
                        data-ui="button"
                        data-size="md"
                        data-variant="secondary"
                        disabled={patchMutation.isPending}
                        onClick={() => void saveRequirements()}
                      >
                        Save requirements
                      </button>
                    </div>
                  </div>
                </PanelCard>
                <PanelCard title="Graph patch" description="Node array + entry node patch for the workflow DAG definition.">
                  <div data-ui="form" data-layout="vertical">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="nodes-json">Nodes JSON</label>
                      <textarea
                        id="nodes-json"
                        data-ui="textarea"
                        value={nodesText}
                        onChange={(event) => {
                          setNodesText(event.target.value);
                          if (nodesError) {
                            setNodesError(undefined);
                          }
                        }}
                      />
                    </div>
                    {nodesError ? <ErrorPanel error={new Error(nodesError)} /> : null}
                    <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                      <button
                        type="button"
                        data-ui="button"
                        data-size="md"
                        data-variant="secondary"
                        disabled={patchMutation.isPending}
                        onClick={() => void saveNodes()}
                      >
                        Save graph
                      </button>
                    </div>
                  </div>
                </PanelCard>
                <PanelCard title="Authoring helper input" description="Append helper text through the existing intake endpoint without turning Studio into a chat ingress.">
                  <div data-ui="form" data-layout="vertical">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="intake-text">Helper input</label>
                      <textarea
                        id="intake-text"
                        data-ui="textarea"
                        value={intakeText}
                        onChange={(event) => setIntakeText(event.target.value)}
                      />
                    </div>
                    {intakeMutation.error ? <ErrorPanel error={intakeMutation.error} /> : null}
                    <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                      <button
                        type="button"
                        data-ui="button"
                        data-size="md"
                        data-variant="secondary"
                        disabled={intakeMutation.isPending}
                        onClick={() => void submitIntake()}
                      >
                        Append helper input
                      </button>
                    </div>
                  </div>
                </PanelCard>
                <PanelCard title="Validate and publish" description="Spec-first publish flow with synthesize kept as an optional authoring helper.">
                  <div data-ui="stack" data-direction="col" data-gap="3">
                    <DraftValidationPanel
                      summary={detailQuery.data.draft.latestValidationSummary}
                      publishable={detailQuery.data.draft.publishable}
                    />
                    {(synthesizeMutation.error || validateMutation.error || publishMutation.error) ? (
                      <ErrorPanel error={synthesizeMutation.error || validateMutation.error || publishMutation.error} />
                    ) : null}
                    <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                      <button
                        type="button"
                        data-ui="button"
                        data-size="md"
                        data-variant="secondary"
                        disabled={synthesizeMutation.isPending}
                        onClick={() => {
                          if (!props.selectedDraftId) return;
                          void synthesizeMutation.mutateAsync(props.selectedDraftId);
                        }}
                      >
                        Synthesize
                      </button>
                      <button
                        type="button"
                        data-ui="button"
                        data-size="md"
                        data-variant="secondary"
                        disabled={validateMutation.isPending}
                        onClick={() => {
                          if (!props.selectedDraftId) return;
                          void validateMutation.mutateAsync(props.selectedDraftId);
                        }}
                      >
                        Validate
                      </button>
                      <button
                        type="button"
                        data-ui="button"
                        data-size="md"
                        data-variant="primary"
                        disabled={publishMutation.isPending}
                        onClick={() => void publishDraft()}
                      >
                        Publish
                      </button>
                    </div>
                  </div>
                </PanelCard>
                <PanelCard title="Read-only DAG preview" description="Derived client-side from the current draft spec.">
                  <DraftDagPreview
                    entryNode={detailQuery.data.draft.currentSpec.entryNode}
                    nodes={detailQuery.data.draft.currentSpec.nodes}
                  />
                </PanelCard>
                <PanelCard title="Current spec snapshot" description="Latest editable spec persisted by platform-api.">
                  <JsonPreview value={detailQuery.data.draft.currentSpec} />
                </PanelCard>
              </div>
            ) : null}
          </div>
        </div>
      </PanelCard>
    </div>
  );
}
