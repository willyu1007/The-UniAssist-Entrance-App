import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  EmptyPanel,
  ErrorPanel,
  JsonPreview,
  LoadingPanel,
  PanelCard,
  SummaryGrid,
  formatDateTime,
} from '../components';
import {
  useApproveGovernanceRequestMutation,
  useControlConsoleEnvironment,
  useCreateGovernanceRequestMutation,
  useCreatePolicyBindingMutation,
  useCreateSecretRefMutation,
  useGovernanceRequestQuery,
  useGovernanceRequestsQuery,
  usePolicyBindingsQuery,
  useRejectGovernanceRequestMutation,
  useScopeGrantsQuery,
  useSecretRefsQuery,
} from '../query';

function parseOptionalJson(text: string): Record<string, unknown> | undefined {
  const next = text.trim();
  if (!next) return undefined;
  const parsed = JSON.parse(next) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON payload must be an object');
  }
  return parsed as Record<string, unknown>;
}

export function GovernanceWorkspace(props: { selectedRequestId?: string }) {
  const { identity } = useControlConsoleEnvironment();
  const policyBindingsQuery = usePolicyBindingsQuery();
  const secretRefsQuery = useSecretRefsQuery();
  const scopeGrantsQuery = useScopeGrantsQuery();
  const governanceRequestsQuery = useGovernanceRequestsQuery();
  const governanceRequestDetailQuery = useGovernanceRequestQuery(props.selectedRequestId);

  const createPolicyBindingMutation = useCreatePolicyBindingMutation();
  const createSecretRefMutation = useCreateSecretRefMutation();
  const createGovernanceRequestMutation = useCreateGovernanceRequestMutation();
  const approveGovernanceRequestMutation = useApproveGovernanceRequestMutation();
  const rejectGovernanceRequestMutation = useRejectGovernanceRequestMutation();

  const [selectedPolicyBindingId, setSelectedPolicyBindingId] = useState<string | undefined>();
  const [selectedSecretRefId, setSelectedSecretRefId] = useState<string | undefined>();
  const [selectedScopeGrantId, setSelectedScopeGrantId] = useState<string | undefined>();

  const [policyWorkspaceId, setPolicyWorkspaceId] = useState('workspace-1');
  const [policyKind, setPolicyKind] = useState<'approval' | 'invoke' | 'delivery' | 'visibility' | 'browser_fallback'>('invoke');
  const [policyTargetType, setPolicyTargetType] = useState<'agent_definition' | 'trigger_binding' | 'policy_binding' | 'secret_ref' | 'scope_grant' | 'connector_binding' | 'action_binding' | 'event_subscription'>('agent_definition');
  const [policyTargetRef, setPolicyTargetRef] = useState('');
  const [policyConfigText, setPolicyConfigText] = useState('{}');
  const [policyError, setPolicyError] = useState<string | undefined>();

  const [secretWorkspaceId, setSecretWorkspaceId] = useState('workspace-1');
  const [environmentScope, setEnvironmentScope] = useState('dev');
  const [providerType, setProviderType] = useState('');
  const [secretMetadataText, setSecretMetadataText] = useState('{}');
  const [secretError, setSecretError] = useState<string | undefined>();

  const [requestWorkspaceId, setRequestWorkspaceId] = useState('workspace-1');
  const [requestKind, setRequestKind] = useState<'agent_activate' | 'trigger_enable' | 'policy_bind_apply' | 'secret_grant_issue' | 'scope_grant_issue' | 'scope_widen' | 'external_write_allow' | 'agent_suspend' | 'agent_retire' | 'trigger_disable' | 'scope_grant_revoke'>('agent_activate');
  const [requestTargetType, setRequestTargetType] = useState<'agent_definition' | 'trigger_binding' | 'policy_binding' | 'secret_ref' | 'scope_grant' | 'connector_binding' | 'action_binding' | 'event_subscription'>('agent_definition');
  const [requestTargetRef, setRequestTargetRef] = useState('');
  const [requestedByActorId, setRequestedByActorId] = useState(identity.userId);
  const [riskLevel, setRiskLevel] = useState<'R0' | 'R1' | 'R2'>('R1');
  const [requestSummary, setRequestSummary] = useState('');
  const [requestJustification, setRequestJustification] = useState('');
  const [desiredStateJsonText, setDesiredStateJsonText] = useState('{}');
  const [requestError, setRequestError] = useState<string | undefined>();

  const [decisionActorRef, setDecisionActorRef] = useState(identity.userId);
  const [decisionComment, setDecisionComment] = useState('');
  const [operationNote, setOperationNote] = useState<string | undefined>();

  useEffect(() => {
    setRequestedByActorId(identity.userId);
    setDecisionActorRef(identity.userId);
  }, [identity.userId]);

  const selectedPolicyBinding = useMemo(
    () => policyBindingsQuery.data?.policyBindings.find((item) => item.policyBindingId === selectedPolicyBindingId),
    [policyBindingsQuery.data?.policyBindings, selectedPolicyBindingId],
  );
  const selectedSecretRef = useMemo(
    () => secretRefsQuery.data?.secretRefs.find((item) => item.secretRefId === selectedSecretRefId),
    [secretRefsQuery.data?.secretRefs, selectedSecretRefId],
  );
  const selectedScopeGrant = useMemo(
    () => scopeGrantsQuery.data?.scopeGrants.find((item) => item.scopeGrantId === selectedScopeGrantId),
    [scopeGrantsQuery.data?.scopeGrants, selectedScopeGrantId],
  );

  async function createPolicyBinding(): Promise<void> {
    try {
      const configJson = parseOptionalJson(policyConfigText) || {};
      setPolicyError(undefined);
      const response = await createPolicyBindingMutation.mutateAsync({
        workspaceId: policyWorkspaceId.trim(),
        policyKind,
        targetType: policyTargetType,
        targetRef: policyTargetRef.trim(),
        configJson,
      });
      setSelectedPolicyBindingId(response.policyBinding.policyBindingId);
      setOperationNote(`Created policy binding ${response.policyBinding.policyBindingId}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        setPolicyError(error.message);
        return;
      }
      throw error;
    }
  }

  async function createSecretRef(): Promise<void> {
    try {
      const metadataJson = parseOptionalJson(secretMetadataText);
      setSecretError(undefined);
      const response = await createSecretRefMutation.mutateAsync({
        workspaceId: secretWorkspaceId.trim(),
        environmentScope: environmentScope.trim(),
        providerType: providerType.trim(),
        metadataJson,
      });
      setSelectedSecretRefId(response.secretRef.secretRefId);
      setOperationNote(`Created secret ref ${response.secretRef.secretRefId}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        setSecretError(error.message);
        return;
      }
      throw error;
    }
  }

  async function createGovernanceRequest(): Promise<void> {
    try {
      const desiredStateJson = parseOptionalJson(desiredStateJsonText) || {};
      setRequestError(undefined);
      const response = await createGovernanceRequestMutation.mutateAsync({
        schemaVersion: 'v1',
        workspaceId: requestWorkspaceId.trim(),
        requestKind,
        targetType: requestTargetType,
        targetRef: requestTargetRef.trim(),
        requestedByActorId: requestedByActorId.trim(),
        riskLevel,
        summary: requestSummary.trim(),
        justification: requestJustification.trim() || undefined,
        desiredStateJson,
      });
      setOperationNote(`Created governance request ${response.request.requestId}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        setRequestError(error.message);
        return;
      }
      throw error;
    }
  }

  async function decideRequest(action: 'approve' | 'reject', requestId: string): Promise<void> {
    const body = {
      schemaVersion: 'v1' as const,
      actorRef: decisionActorRef.trim(),
      comment: decisionComment.trim() || undefined,
    };
    const response = action === 'approve'
      ? await approveGovernanceRequestMutation.mutateAsync({ requestId, body })
      : await rejectGovernanceRequestMutation.mutateAsync({ requestId, body });
    setOperationNote(`${action}d governance request ${response.request.requestId}`);
  }

  return (
    <div data-ui="stack" data-direction="col" data-gap="4" className="console-route-layout">
      <PanelCard
        title="Governance"
        description="Manage policy bindings, secret refs, scope grants, and governance change requests."
      >
        <SummaryGrid
          items={[
            { label: 'Policy bindings', value: policyBindingsQuery.data?.policyBindings.length || 0 },
            { label: 'Secret refs', value: secretRefsQuery.data?.secretRefs.length || 0 },
            { label: 'Scope grants', value: scopeGrantsQuery.data?.scopeGrants.length || 0 },
            { label: 'Requests', value: governanceRequestsQuery.data?.requests.length || 0 },
          ]}
        />

        {operationNote ? (
          <div data-ui="alert" data-tone="info">
            <div data-slot="title">Governance action</div>
            <p data-ui="text" data-variant="body" data-tone="secondary">{operationNote}</p>
          </div>
        ) : null}

        <div data-ui="stack" data-direction="col" data-gap="4">
          <PanelCard title="Policy bindings" description="Attach policy shells to agents, triggers, or capability objects.">
            <div className="console-two-up">
              <div data-ui="stack" data-direction="col" data-gap="3">
                {policyBindingsQuery.isLoading ? <LoadingPanel label="Loading policy bindings" /> : null}
                {policyBindingsQuery.error ? <ErrorPanel error={policyBindingsQuery.error} /> : null}
                <div data-ui="list" data-variant="rows" data-density="comfortable">
                  {policyBindingsQuery.data?.policyBindings.map((binding) => (
                    <div key={binding.policyBindingId}>
                      <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                        <div data-slot="start">
                          <button type="button" data-ui="button" data-size="sm" data-variant="outlined" onClick={() => setSelectedPolicyBindingId(binding.policyBindingId)}>
                            {binding.policyKind}
                          </button>
                        </div>
                        <div data-slot="end">
                          <span data-ui="badge" data-variant="subtle" data-tone="neutral">{binding.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div data-ui="stack" data-direction="col" data-gap="3">
                <div data-ui="form" data-layout="vertical">
                  <div className="console-two-up">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="policy-workspace-id">Workspace ID</label>
                      <input id="policy-workspace-id" data-ui="input" data-size="md" value={policyWorkspaceId} onChange={(event) => setPolicyWorkspaceId(event.target.value)} />
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="policy-kind">Policy kind</label>
                      <select id="policy-kind" data-ui="select" data-size="md" value={policyKind} onChange={(event) => setPolicyKind(event.target.value as typeof policyKind)}>
                        <option value="approval">approval</option>
                        <option value="invoke">invoke</option>
                        <option value="delivery">delivery</option>
                        <option value="visibility">visibility</option>
                        <option value="browser_fallback">browser_fallback</option>
                      </select>
                    </div>
                  </div>
                  <div className="console-two-up">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="policy-target-type">Target type</label>
                      <select id="policy-target-type" data-ui="select" data-size="md" value={policyTargetType} onChange={(event) => setPolicyTargetType(event.target.value as typeof policyTargetType)}>
                        <option value="agent_definition">agent_definition</option>
                        <option value="trigger_binding">trigger_binding</option>
                        <option value="policy_binding">policy_binding</option>
                        <option value="secret_ref">secret_ref</option>
                        <option value="scope_grant">scope_grant</option>
                        <option value="connector_binding">connector_binding</option>
                        <option value="action_binding">action_binding</option>
                        <option value="event_subscription">event_subscription</option>
                      </select>
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="policy-target-ref">Target ref</label>
                      <input id="policy-target-ref" data-ui="input" data-size="md" value={policyTargetRef} onChange={(event) => setPolicyTargetRef(event.target.value)} />
                    </div>
                  </div>
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="policy-config-json">Config JSON</label>
                    <textarea id="policy-config-json" data-ui="textarea" value={policyConfigText} onChange={(event) => setPolicyConfigText(event.target.value)} />
                  </div>
                  {policyError ? <ErrorPanel title="Invalid policy JSON" error={policyError} /> : null}
                  {createPolicyBindingMutation.error ? <ErrorPanel error={createPolicyBindingMutation.error} /> : null}
                  <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                    <button type="button" data-ui="button" data-size="md" data-variant="primary" disabled={createPolicyBindingMutation.isPending} onClick={() => void createPolicyBinding()}>
                      Create policy binding
                    </button>
                  </div>
                </div>

                {selectedPolicyBinding ? (
                  <JsonPreview value={selectedPolicyBinding} />
                ) : (
                  <EmptyPanel title="No policy binding selected" body="Choose a policy binding to inspect its target and configuration." />
                )}
              </div>
            </div>
          </PanelCard>

          <PanelCard title="Secret refs" description="Workspace-owned secret references used by triggers, connectors, and bridges.">
            <div className="console-two-up">
              <div data-ui="stack" data-direction="col" data-gap="3">
                {secretRefsQuery.isLoading ? <LoadingPanel label="Loading secret refs" /> : null}
                {secretRefsQuery.error ? <ErrorPanel error={secretRefsQuery.error} /> : null}
                <div data-ui="list" data-variant="rows" data-density="comfortable">
                  {secretRefsQuery.data?.secretRefs.map((secretRef) => (
                    <div key={secretRef.secretRefId}>
                      <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                        <div data-slot="start">
                          <button type="button" data-ui="button" data-size="sm" data-variant="outlined" onClick={() => setSelectedSecretRefId(secretRef.secretRefId)}>
                            {secretRef.providerType}
                          </button>
                        </div>
                        <div data-slot="end">
                          <span data-ui="badge" data-variant="subtle" data-tone="neutral">{secretRef.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div data-ui="stack" data-direction="col" data-gap="3">
                <div data-ui="form" data-layout="vertical">
                  <div className="console-two-up">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="secret-workspace-id">Workspace ID</label>
                      <input id="secret-workspace-id" data-ui="input" data-size="md" value={secretWorkspaceId} onChange={(event) => setSecretWorkspaceId(event.target.value)} />
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="secret-provider-type">Provider type</label>
                      <input id="secret-provider-type" data-ui="input" data-size="md" value={providerType} onChange={(event) => setProviderType(event.target.value)} />
                    </div>
                  </div>
                  <div className="console-two-up">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="secret-environment-scope">Environment scope</label>
                      <input id="secret-environment-scope" data-ui="input" data-size="md" value={environmentScope} onChange={(event) => setEnvironmentScope(event.target.value)} />
                    </div>
                  </div>
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="secret-metadata-json">Metadata JSON</label>
                    <textarea id="secret-metadata-json" data-ui="textarea" value={secretMetadataText} onChange={(event) => setSecretMetadataText(event.target.value)} />
                  </div>
                  {secretError ? <ErrorPanel title="Invalid secret metadata" error={secretError} /> : null}
                  {createSecretRefMutation.error ? <ErrorPanel error={createSecretRefMutation.error} /> : null}
                  <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                    <button type="button" data-ui="button" data-size="md" data-variant="primary" disabled={createSecretRefMutation.isPending} onClick={() => void createSecretRef()}>
                      Create secret ref
                    </button>
                  </div>
                </div>

                {selectedSecretRef ? (
                  <JsonPreview value={selectedSecretRef} />
                ) : (
                  <EmptyPanel title="No secret ref selected" body="Choose a secret ref to inspect provider metadata and environment scope." />
                )}
              </div>
            </div>
          </PanelCard>

          <PanelCard title="Scope grants" description="Inspect active and pending grants without issuing per-item API detail calls.">
            {scopeGrantsQuery.isLoading ? <LoadingPanel label="Loading scope grants" /> : null}
            {scopeGrantsQuery.error ? <ErrorPanel error={scopeGrantsQuery.error} /> : null}
            <div className="console-two-up">
              <div data-ui="list" data-variant="rows" data-density="comfortable">
                {scopeGrantsQuery.data?.scopeGrants.map((scopeGrant) => (
                  <div key={scopeGrant.scopeGrantId}>
                    <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                      <div data-slot="start">
                        <button type="button" data-ui="button" data-size="sm" data-variant="outlined" onClick={() => setSelectedScopeGrantId(scopeGrant.scopeGrantId)}>
                          {scopeGrant.resourceType}
                        </button>
                      </div>
                      <div data-slot="end">
                        <span data-ui="badge" data-variant="subtle" data-tone="neutral">{scopeGrant.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                {selectedScopeGrant ? (
                  <JsonPreview value={selectedScopeGrant} />
                ) : (
                  <EmptyPanel title="No scope grant selected" body="Choose a scope grant to inspect resource reach and expiry." />
                )}
              </div>
            </div>
          </PanelCard>

          <PanelCard title="Governance requests" description="Create, inspect, approve, and reject change requests through the operator surface.">
            <div className="console-two-up">
              <div data-ui="stack" data-direction="col" data-gap="3">
                {governanceRequestsQuery.isLoading ? <LoadingPanel label="Loading governance requests" /> : null}
                {governanceRequestsQuery.error ? <ErrorPanel error={governanceRequestsQuery.error} /> : null}
                <div data-ui="list" data-variant="rows" data-density="comfortable">
                  {governanceRequestsQuery.data?.requests.map((request) => (
                    <div key={request.requestId}>
                      <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                        <div data-slot="start">
                          <Link
                            to="/governance/requests/$requestId"
                            params={{ requestId: request.requestId }}
                            data-ui="link"
                          >
                            {request.requestKind}
                          </Link>
                        </div>
                        <div data-slot="end">
                          <span data-ui="badge" data-variant="subtle" data-tone="neutral">{request.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div data-ui="form" data-layout="vertical">
                  <div className="console-two-up">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="request-workspace-id">Workspace ID</label>
                      <input id="request-workspace-id" data-ui="input" data-size="md" value={requestWorkspaceId} onChange={(event) => setRequestWorkspaceId(event.target.value)} />
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="requested-by-actor-id">Requested by actor</label>
                      <input id="requested-by-actor-id" data-ui="input" data-size="md" value={requestedByActorId} onChange={(event) => setRequestedByActorId(event.target.value)} />
                    </div>
                  </div>
                  <div className="console-three-up">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="request-kind">Request kind</label>
                      <select id="request-kind" data-ui="select" data-size="md" value={requestKind} onChange={(event) => setRequestKind(event.target.value as typeof requestKind)}>
                        <option value="agent_activate">agent_activate</option>
                        <option value="trigger_enable">trigger_enable</option>
                        <option value="policy_bind_apply">policy_bind_apply</option>
                        <option value="secret_grant_issue">secret_grant_issue</option>
                        <option value="scope_grant_issue">scope_grant_issue</option>
                        <option value="scope_widen">scope_widen</option>
                        <option value="external_write_allow">external_write_allow</option>
                        <option value="agent_suspend">agent_suspend</option>
                        <option value="agent_retire">agent_retire</option>
                        <option value="trigger_disable">trigger_disable</option>
                        <option value="scope_grant_revoke">scope_grant_revoke</option>
                      </select>
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="request-target-type">Target type</label>
                      <select id="request-target-type" data-ui="select" data-size="md" value={requestTargetType} onChange={(event) => setRequestTargetType(event.target.value as typeof requestTargetType)}>
                        <option value="agent_definition">agent_definition</option>
                        <option value="trigger_binding">trigger_binding</option>
                        <option value="policy_binding">policy_binding</option>
                        <option value="secret_ref">secret_ref</option>
                        <option value="scope_grant">scope_grant</option>
                        <option value="connector_binding">connector_binding</option>
                        <option value="action_binding">action_binding</option>
                        <option value="event_subscription">event_subscription</option>
                      </select>
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="request-risk-level">Risk level</label>
                      <select id="request-risk-level" data-ui="select" data-size="md" value={riskLevel} onChange={(event) => setRiskLevel(event.target.value as typeof riskLevel)}>
                        <option value="R0">R0</option>
                        <option value="R1">R1</option>
                        <option value="R2">R2</option>
                      </select>
                    </div>
                  </div>
                  <div className="console-two-up">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="request-target-ref">Target ref</label>
                      <input id="request-target-ref" data-ui="input" data-size="md" value={requestTargetRef} onChange={(event) => setRequestTargetRef(event.target.value)} />
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="request-summary">Summary</label>
                      <input id="request-summary" data-ui="input" data-size="md" value={requestSummary} onChange={(event) => setRequestSummary(event.target.value)} />
                    </div>
                  </div>
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="request-justification">Justification</label>
                    <textarea id="request-justification" data-ui="textarea" value={requestJustification} onChange={(event) => setRequestJustification(event.target.value)} />
                  </div>
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="desired-state-json">Desired state JSON</label>
                    <textarea id="desired-state-json" data-ui="textarea" value={desiredStateJsonText} onChange={(event) => setDesiredStateJsonText(event.target.value)} />
                  </div>
                  {requestError ? <ErrorPanel title="Invalid desired state" error={requestError} /> : null}
                  {createGovernanceRequestMutation.error ? <ErrorPanel error={createGovernanceRequestMutation.error} /> : null}
                  <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                    <button type="button" data-ui="button" data-size="md" data-variant="primary" disabled={createGovernanceRequestMutation.isPending} onClick={() => void createGovernanceRequest()}>
                      Create governance request
                    </button>
                  </div>
                </div>
              </div>

              <div data-ui="stack" data-direction="col" data-gap="3">
                {props.selectedRequestId ? (
                  governanceRequestDetailQuery.isLoading ? <LoadingPanel label="Loading governance request detail" /> : governanceRequestDetailQuery.data ? (
                    <>
                      <SummaryGrid
                        items={[
                          { label: 'Request', value: governanceRequestDetailQuery.data.request.requestKind, helper: governanceRequestDetailQuery.data.request.requestId },
                          { label: 'Status', value: governanceRequestDetailQuery.data.request.status },
                          { label: 'Risk', value: governanceRequestDetailQuery.data.request.riskLevel },
                          { label: 'Updated', value: formatDateTime(governanceRequestDetailQuery.data.request.updatedAt) },
                        ]}
                      />
                      <JsonPreview value={governanceRequestDetailQuery.data} />
                      <div data-ui="form" data-layout="vertical">
                        <div className="console-two-up">
                          <div data-ui="field">
                            <label data-slot="label" htmlFor="decision-actor-ref">Decision actor</label>
                            <input id="decision-actor-ref" data-ui="input" data-size="md" value={decisionActorRef} onChange={(event) => setDecisionActorRef(event.target.value)} />
                          </div>
                          <div data-ui="field">
                            <label data-slot="label" htmlFor="decision-comment">Comment</label>
                            <input id="decision-comment" data-ui="input" data-size="md" value={decisionComment} onChange={(event) => setDecisionComment(event.target.value)} />
                          </div>
                        </div>
                        {(approveGovernanceRequestMutation.error || rejectGovernanceRequestMutation.error) ? (
                          <ErrorPanel error={approveGovernanceRequestMutation.error || rejectGovernanceRequestMutation.error} />
                        ) : null}
                        <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                          <button type="button" data-ui="button" data-size="md" data-variant="primary" disabled={approveGovernanceRequestMutation.isPending} onClick={() => void decideRequest('approve', governanceRequestDetailQuery.data.request.requestId)}>
                            Approve request
                          </button>
                          <button type="button" data-ui="button" data-size="md" data-variant="danger" disabled={rejectGovernanceRequestMutation.isPending} onClick={() => void decideRequest('reject', governanceRequestDetailQuery.data.request.requestId)}>
                            Reject request
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null
                ) : (
                  <EmptyPanel title="No governance request selected" body="Open a request detail path to review desired state and decision history." />
                )}
              </div>
            </div>
          </PanelCard>
        </div>
      </PanelCard>
    </div>
  );
}
