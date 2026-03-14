import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  EmptyPanel,
  ErrorPanel,
  JsonPreview,
  LoadingPanel,
  PanelCard,
  SummaryGrid,
  formatDateTime,
} from '../components';
import { useStartDebugRunMutation, useTemplateDetailQuery, useTemplatesQuery } from '../query';

function parseOptionalJson(text: string): Record<string, unknown> | undefined {
  const next = text.trim();
  if (!next) {
    return undefined;
  }
  const parsed = JSON.parse(next) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('input payload must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

export function TemplatesWorkspace(props: { selectedWorkflowId?: string }) {
  const navigate = useNavigate();
  const templatesQuery = useTemplatesQuery();
  const detailQuery = useTemplateDetailQuery(props.selectedWorkflowId);
  const debugRunMutation = useStartDebugRunMutation();

  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>();
  const [inputText, setInputText] = useState('');
  const [inputPayloadText, setInputPayloadText] = useState('');
  const [payloadError, setPayloadError] = useState<string | undefined>();

  useEffect(() => {
    const versions = detailQuery.data?.workflow.versions;
    if (!versions?.length) {
      setSelectedVersionId(undefined);
      return;
    }
    setSelectedVersionId((current) => (
      current && versions.some((item) => item.templateVersionId === current)
        ? current
        : versions[0]?.templateVersionId
    ));
  }, [detailQuery.data?.workflow.workflow.workflowId, detailQuery.data?.workflow.versions]);

  const selectedVersion = useMemo(
    () => detailQuery.data?.workflow.versions.find((version) => version.templateVersionId === selectedVersionId)
      || detailQuery.data?.workflow.versions[0],
    [detailQuery.data?.workflow.versions, selectedVersionId],
  );

  async function startDebugRun(): Promise<void> {
    if (!selectedVersion) return;
    try {
      const inputPayload = parseOptionalJson(inputPayloadText);
      setPayloadError(undefined);
      const response = await debugRunMutation.mutateAsync({
        workflowTemplateVersionId: selectedVersion.templateVersionId,
        inputText: inputText.trim() || undefined,
        inputPayload,
      });
      await navigate({ to: '/runs/$runId', params: { runId: response.run.run.runId } });
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        setPayloadError(error.message);
        return;
      }
      throw error;
    }
  }

  return (
    <div data-ui="stack" data-direction="col" data-gap="4" className="console-route-layout">
      <PanelCard
        title="Templates"
        description="Published workflow templates, version lineage, and debug-only direct starts."
      >
        <div className="console-master-detail">
          <div data-ui="stack" data-direction="col" data-gap="3">
            {templatesQuery.isLoading ? <LoadingPanel label="Loading templates" /> : null}
            {templatesQuery.error ? <ErrorPanel error={templatesQuery.error} /> : null}
            {templatesQuery.data && templatesQuery.data.workflows.length === 0 ? (
              <EmptyPanel title="No templates published" body="Publish a draft from Studio to create an operator-visible template." />
            ) : null}
            <div data-ui="list" data-variant="cards" data-density="comfortable" className="console-sidebar-list">
              {templatesQuery.data?.workflows.map((workflow) => (
                <div key={workflow.workflowId}>
                  <div data-ui="stack" data-direction="col" data-gap="2">
                    <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                      <div data-slot="start">
                        <Link to="/templates/$workflowId" params={{ workflowId: workflow.workflowId }} data-ui="link">
                          {workflow.name}
                        </Link>
                      </div>
                      <div data-slot="end">
                        <span data-ui="badge" data-variant="subtle" data-tone="neutral">{workflow.status}</span>
                      </div>
                    </div>
                    <span data-ui="text" data-variant="caption" data-tone="secondary">
                      {workflow.workflowKey} · updated {formatDateTime(workflow.updatedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="console-detail-scroll">
            {!props.selectedWorkflowId ? (
              <EmptyPanel title="Choose a template" body="Select a published template to inspect versions, spec, and debug run controls." />
            ) : null}
            {props.selectedWorkflowId && detailQuery.isLoading ? <LoadingPanel label="Loading template detail" /> : null}
            {detailQuery.error ? <ErrorPanel error={detailQuery.error} /> : null}
            {detailQuery.data ? (
              <div data-ui="stack" data-direction="col" data-gap="4">
                <SummaryGrid
                  items={[
                    { label: 'Template', value: detailQuery.data.workflow.workflow.name, helper: detailQuery.data.workflow.workflow.workflowKey },
                    { label: 'Status', value: detailQuery.data.workflow.workflow.status },
                    { label: 'Versions', value: detailQuery.data.workflow.versions.length },
                    { label: 'Updated', value: formatDateTime(detailQuery.data.workflow.workflow.updatedAt) },
                  ]}
                />

                <PanelCard title="Published versions" description="Inspect versions and choose a published version for debug or agent promotion.">
                  {detailQuery.data.workflow.versions.length === 0 ? (
                    <EmptyPanel title="No versions published" body="Publish a draft to create the first version for this template." />
                  ) : (
                    <div data-ui="list" data-variant="rows" data-density="comfortable">
                      {detailQuery.data.workflow.versions.map((version) => (
                        <div key={version.templateVersionId}>
                          <div data-ui="stack" data-direction="col" data-gap="2">
                            <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                              <div data-slot="start">
                                <strong data-ui="text" data-variant="body" data-tone="primary">
                                  v{version.version}
                                </strong>
                                <span data-ui="badge" data-variant="subtle" data-tone="neutral">{version.status}</span>
                              </div>
                              <div data-slot="end">
                                <button
                                  type="button"
                                  data-ui="button"
                                  data-size="sm"
                                  data-variant={selectedVersion?.templateVersionId === version.templateVersionId ? 'primary' : 'outlined'}
                                  onClick={() => setSelectedVersionId(version.templateVersionId)}
                                >
                                  Inspect
                                </button>
                                <Link
                                  to="/agents/from-template/$templateVersionRef"
                                  params={{ templateVersionRef: version.templateVersionId }}
                                  data-ui="link"
                                >
                                  Create agent from version
                                </Link>
                              </div>
                            </div>
                            <span data-ui="text" data-variant="caption" data-tone="secondary">
                              {version.templateVersionId} · created {formatDateTime(version.createdAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </PanelCard>

                <PanelCard title="Debug run launch" description="Direct version start remains studio/debug-only and does not replace production agent ingress.">
                  {selectedVersion ? (
                    <div data-ui="form" data-layout="vertical">
                      <SummaryGrid
                        items={[
                          { label: 'Selected version', value: `v${selectedVersion.version}` },
                          { label: 'Version status', value: selectedVersion.status },
                        ]}
                      />
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="template-debug-input-text">Input text</label>
                        <textarea
                          id="template-debug-input-text"
                          data-ui="textarea"
                          value={inputText}
                          onChange={(event) => setInputText(event.target.value)}
                          placeholder="Optional run input for template debug."
                        />
                      </div>
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="template-debug-input-payload">Input payload JSON</label>
                        <textarea
                          id="template-debug-input-payload"
                          data-ui="textarea"
                          value={inputPayloadText}
                          onChange={(event) => setInputPayloadText(event.target.value)}
                          placeholder='{"subjectRef":"case-1"}'
                        />
                      </div>
                      {payloadError ? <ErrorPanel title="Invalid payload" error={payloadError} /> : null}
                      {debugRunMutation.error ? <ErrorPanel error={debugRunMutation.error} /> : null}
                      <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                        <button
                          type="button"
                          data-ui="button"
                          data-size="md"
                          data-variant="primary"
                          disabled={debugRunMutation.isPending}
                          onClick={() => void startDebugRun()}
                        >
                          Start debug run
                        </button>
                      </div>
                    </div>
                  ) : (
                    <EmptyPanel title="No version selected" body="Select a published version before starting a debug run." />
                  )}
                </PanelCard>

                <PanelCard title="Selected version spec" description="Authoritative template spec snapshot for the selected version.">
                  {selectedVersion ? (
                    <JsonPreview value={selectedVersion.spec} />
                  ) : (
                    <EmptyPanel title="No spec selected" body="Choose a version from the published list to inspect its spec." />
                  )}
                </PanelCard>
              </div>
            ) : null}
          </div>
        </div>
      </PanelCard>
    </div>
  );
}
