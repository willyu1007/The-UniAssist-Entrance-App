import { useEffect, useState } from 'react';
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
import {
  useActionBindingsQuery,
  useActivateAgentMutation,
  useAgentQuery,
  useAgentsQuery,
  useConnectorBindingsQuery,
  useCreateActionBindingMutation,
  useCreateAgentMutation,
  useCreateTriggerBindingMutation,
  useDisableTriggerBindingMutation,
  useEnableTriggerBindingMutation,
  useRetireAgentMutation,
  useStartAgentRunMutation,
  useSuspendAgentMutation,
  useTriggerBindingsQuery,
} from '../query';

function parseOptionalJson(text: string): Record<string, unknown> | undefined {
  const next = text.trim();
  if (!next) {
    return undefined;
  }
  const parsed = JSON.parse(next) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON payload must be an object');
  }
  return parsed as Record<string, unknown>;
}

function parsePositiveInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const next = Number(trimmed);
  if (!Number.isFinite(next) || next <= 0) {
    throw new Error('timeout must be a positive integer');
  }
  return Math.trunc(next);
}

export function AgentsWorkspace(props: { selectedAgentId?: string; templateVersionRef?: string }) {
  const navigate = useNavigate();
  const agentsQuery = useAgentsQuery();
  const connectorBindingsQuery = useConnectorBindingsQuery();
  const detailQuery = useAgentQuery(props.selectedAgentId);
  const triggerBindingsQuery = useTriggerBindingsQuery(props.selectedAgentId);
  const actionBindingsQuery = useActionBindingsQuery(props.selectedAgentId);

  const createAgentMutation = useCreateAgentMutation();
  const activateAgentMutation = useActivateAgentMutation();
  const suspendAgentMutation = useSuspendAgentMutation();
  const retireAgentMutation = useRetireAgentMutation();
  const startAgentRunMutation = useStartAgentRunMutation();
  const createTriggerBindingMutation = useCreateTriggerBindingMutation();
  const enableTriggerBindingMutation = useEnableTriggerBindingMutation();
  const disableTriggerBindingMutation = useDisableTriggerBindingMutation();
  const createActionBindingMutation = useCreateActionBindingMutation();

  const [workspaceId, setWorkspaceId] = useState('workspace-1');
  const [templateVersionRef, setTemplateVersionRef] = useState(props.templateVersionRef || '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [executorStrategy, setExecutorStrategy] = useState<'platform_runtime' | 'external_runtime'>('platform_runtime');
  const [bridgeId, setBridgeId] = useState('');
  const [identityRef, setIdentityRef] = useState('');
  const [toolProfile, setToolProfile] = useState('');
  const [riskLevel, setRiskLevel] = useState<'R0' | 'R1' | 'R2'>('R1');
  const [ownerActorRef, setOwnerActorRef] = useState('');

  const [lifecycleSummary, setLifecycleSummary] = useState('');
  const [lifecycleJustification, setLifecycleJustification] = useState('');
  const [operationNote, setOperationNote] = useState<string | undefined>();

  const [runInputText, setRunInputText] = useState('');
  const [runInputPayloadText, setRunInputPayloadText] = useState('');
  const [runPayloadError, setRunPayloadError] = useState<string | undefined>();

  const [triggerWorkspaceId, setTriggerWorkspaceId] = useState('workspace-1');
  const [triggerKind, setTriggerKind] = useState<'schedule' | 'webhook' | 'event_subscription'>('schedule');
  const [triggerConfigText, setTriggerConfigText] = useState('{}');
  const [triggerConfigError, setTriggerConfigError] = useState<string | undefined>();

  const [actionWorkspaceId, setActionWorkspaceId] = useState('workspace-1');
  const [actionRef, setActionRef] = useState('');
  const [connectorBindingId, setConnectorBindingId] = useState('');
  const [capabilityId, setCapabilityId] = useState('');
  const [sideEffectClass, setSideEffectClass] = useState<'read' | 'write'>('read');
  const [executionMode, setExecutionMode] = useState<'sync' | 'async'>('sync');
  const [timeoutMs, setTimeoutMs] = useState('');
  const [browserFallbackMode, setBrowserFallbackMode] = useState<'disabled' | 'query_only'>('disabled');
  const [actionConfigText, setActionConfigText] = useState('{}');
  const [actionConfigError, setActionConfigError] = useState<string | undefined>();

  useEffect(() => {
    if (props.templateVersionRef) {
      setTemplateVersionRef(props.templateVersionRef);
    }
  }, [props.templateVersionRef]);

  useEffect(() => {
    if (!connectorBindingId && connectorBindingsQuery.data?.connectorBindings[0]) {
      setConnectorBindingId(connectorBindingsQuery.data.connectorBindings[0].connectorBindingId);
    }
  }, [connectorBindingId, connectorBindingsQuery.data?.connectorBindings]);

  async function createAgent(): Promise<void> {
    const response = await createAgentMutation.mutateAsync({
      workspaceId: workspaceId.trim(),
      templateVersionRef: templateVersionRef.trim(),
      name: name.trim(),
      description: description.trim() || undefined,
      bridgeId: bridgeId.trim() || undefined,
      identityRef: identityRef.trim() || undefined,
      executorStrategy,
      toolProfile: toolProfile.trim() || undefined,
      riskLevel,
      ownerActorRef: ownerActorRef.trim() || undefined,
    });
    setOperationNote(`Created agent ${response.agent.agentId}`);
    await navigate({ to: '/agents/$agentId', params: { agentId: response.agent.agentId } });
  }

  async function runLifecycleAction(
    action: 'activate' | 'suspend' | 'retire',
    agentId: string,
  ): Promise<void> {
    const input = {
      agentId,
      summary: lifecycleSummary.trim() || undefined,
      justification: lifecycleJustification.trim() || undefined,
    };
    const response = action === 'activate'
      ? await activateAgentMutation.mutateAsync(input)
      : action === 'suspend'
        ? await suspendAgentMutation.mutateAsync(input)
        : await retireAgentMutation.mutateAsync(input);
    setOperationNote(
      response.governanceRequest
        ? `${action} requested via governance request ${response.governanceRequest.requestId}`
        : `${action} applied to agent ${response.agent.agentId}`,
    );
  }

  async function startRun(agentId: string): Promise<void> {
    try {
      const inputPayload = parseOptionalJson(runInputPayloadText);
      setRunPayloadError(undefined);
      const response = await startAgentRunMutation.mutateAsync({
        agentId,
        body: {
          inputText: runInputText.trim() || undefined,
          inputPayload,
        },
      });
      setOperationNote(`Started production run ${response.run.run.runId}`);
      await navigate({ to: '/runs/$runId', params: { runId: response.run.run.runId } });
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        setRunPayloadError(error.message);
        return;
      }
      throw error;
    }
  }

  async function createTriggerBinding(agentId: string): Promise<void> {
    try {
      const configJson = parseOptionalJson(triggerConfigText) || {};
      setTriggerConfigError(undefined);
      const response = await createTriggerBindingMutation.mutateAsync({
        agentId,
        body: {
          workspaceId: triggerWorkspaceId.trim(),
          triggerKind,
          configJson,
        },
      });
      setOperationNote(`Created trigger binding ${response.triggerBinding.triggerBindingId}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        setTriggerConfigError(error.message);
        return;
      }
      throw error;
    }
  }

  async function toggleTrigger(
    action: 'enable' | 'disable',
    triggerBindingId: string,
    agentId: string,
  ): Promise<void> {
    const input = {
      triggerBindingId,
      agentId,
      summary: lifecycleSummary.trim() || undefined,
      justification: lifecycleJustification.trim() || undefined,
    };
    const response = action === 'enable'
      ? await enableTriggerBindingMutation.mutateAsync(input)
      : await disableTriggerBindingMutation.mutateAsync(input);
    setOperationNote(
      response.governanceRequest
        ? `${action} requested via governance request ${response.governanceRequest.requestId}`
        : `${action} applied to trigger ${response.triggerBinding.triggerBindingId}`,
    );
  }

  async function createActionBinding(agentId: string): Promise<void> {
    try {
      const configJson = parseOptionalJson(actionConfigText);
      const parsedTimeoutMs = parsePositiveInt(timeoutMs);
      setActionConfigError(undefined);
      const response = await createActionBindingMutation.mutateAsync({
        agentId,
        body: {
          workspaceId: actionWorkspaceId.trim(),
          actionRef: actionRef.trim(),
          connectorBindingId: connectorBindingId.trim(),
          capabilityId: capabilityId.trim(),
          sideEffectClass,
          executionMode,
          timeoutMs: parsedTimeoutMs,
          browserFallbackMode,
          configJson,
        },
      });
      setOperationNote(`Created action binding ${response.actionBinding.actionBindingId}`);
    } catch (error) {
      if (error instanceof Error && (error.message.includes('JSON') || error.message.includes('timeout'))) {
        setActionConfigError(error.message);
        return;
      }
      throw error;
    }
  }

  return (
    <div data-ui="stack" data-direction="col" data-gap="4" className="console-route-layout">
      <PanelCard
        title="Agents"
        description="Create agents from published versions, manage lifecycle, wire triggers, and start production runs."
      >
        <div className="console-master-detail">
          <div data-ui="stack" data-direction="col" data-gap="3">
            <PanelCard title="Create agent" description="Promote a published version into an operator-managed agent definition.">
              <div data-ui="form" data-layout="vertical">
                <div data-ui="field">
                  <label data-slot="label" htmlFor="agent-workspace-id">Workspace ID</label>
                  <input id="agent-workspace-id" data-ui="input" data-size="md" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} />
                </div>
                <div data-ui="field">
                  <label data-slot="label" htmlFor="agent-template-version-ref">Template version ref</label>
                  <input id="agent-template-version-ref" data-ui="input" data-size="md" value={templateVersionRef} onChange={(event) => setTemplateVersionRef(event.target.value)} />
                </div>
                <div data-ui="field">
                  <label data-slot="label" htmlFor="agent-name">Name</label>
                  <input id="agent-name" data-ui="input" data-size="md" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div data-ui="field">
                  <label data-slot="label" htmlFor="agent-description">Description</label>
                  <textarea id="agent-description" data-ui="textarea" value={description} onChange={(event) => setDescription(event.target.value)} />
                </div>
                <div className="console-two-up">
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="agent-executor-strategy">Executor strategy</label>
                    <select id="agent-executor-strategy" data-ui="select" data-size="md" value={executorStrategy} onChange={(event) => setExecutorStrategy(event.target.value as 'platform_runtime' | 'external_runtime')}>
                      <option value="platform_runtime">platform_runtime</option>
                      <option value="external_runtime">external_runtime</option>
                    </select>
                  </div>
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="agent-risk-level">Risk level</label>
                    <select id="agent-risk-level" data-ui="select" data-size="md" value={riskLevel} onChange={(event) => setRiskLevel(event.target.value as 'R0' | 'R1' | 'R2')}>
                      <option value="R0">R0</option>
                      <option value="R1">R1</option>
                      <option value="R2">R2</option>
                    </select>
                  </div>
                </div>
                <div className="console-two-up">
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="agent-bridge-id">Bridge ID</label>
                    <input id="agent-bridge-id" data-ui="input" data-size="md" value={bridgeId} onChange={(event) => setBridgeId(event.target.value)} />
                  </div>
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="agent-identity-ref">Identity ref</label>
                    <input id="agent-identity-ref" data-ui="input" data-size="md" value={identityRef} onChange={(event) => setIdentityRef(event.target.value)} />
                  </div>
                </div>
                <div className="console-two-up">
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="agent-tool-profile">Tool profile</label>
                    <input id="agent-tool-profile" data-ui="input" data-size="md" value={toolProfile} onChange={(event) => setToolProfile(event.target.value)} />
                  </div>
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="agent-owner-actor-ref">Owner actor ref</label>
                    <input id="agent-owner-actor-ref" data-ui="input" data-size="md" value={ownerActorRef} onChange={(event) => setOwnerActorRef(event.target.value)} />
                  </div>
                </div>
                {createAgentMutation.error ? <ErrorPanel error={createAgentMutation.error} /> : null}
                <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                  <button type="button" data-ui="button" data-size="md" data-variant="primary" disabled={createAgentMutation.isPending} onClick={() => void createAgent()}>
                    Create agent
                  </button>
                </div>
              </div>
            </PanelCard>

            {agentsQuery.isLoading ? <LoadingPanel label="Loading agents" /> : null}
            {agentsQuery.error ? <ErrorPanel error={agentsQuery.error} /> : null}
            {agentsQuery.data && agentsQuery.data.agents.length === 0 ? (
              <EmptyPanel title="No agents created" body="Promote a template version to create the first pure-v1 agent." />
            ) : null}
            <div data-ui="list" data-variant="cards" data-density="comfortable" className="console-sidebar-list">
              {agentsQuery.data?.agents.map((agent) => (
                <div key={agent.agentId}>
                  <div data-ui="stack" data-direction="col" data-gap="2">
                    <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                      <div data-slot="start">
                        <Link to="/agents/$agentId" params={{ agentId: agent.agentId }} data-ui="link">
                          {agent.name}
                        </Link>
                      </div>
                      <div data-slot="end">
                        <span data-ui="badge" data-variant="subtle" data-tone="neutral">{agent.activationState}</span>
                      </div>
                    </div>
                    <span data-ui="text" data-variant="caption" data-tone="secondary">
                      {agent.executorStrategy} · {agent.templateVersionRef}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="console-detail-scroll">
            {!props.selectedAgentId ? (
              <EmptyPanel title="Choose an agent" body="Select an agent to inspect lifecycle, trigger bindings, action bindings, and run controls." />
            ) : null}
            {props.selectedAgentId && detailQuery.isLoading ? <LoadingPanel label="Loading agent detail" /> : null}
            {detailQuery.error ? <ErrorPanel error={detailQuery.error} /> : null}
            {detailQuery.data ? (
              <div data-ui="stack" data-direction="col" data-gap="4">
                <SummaryGrid
                  items={[
                    { label: 'Agent', value: detailQuery.data.agent.name, helper: detailQuery.data.agent.agentId },
                    { label: 'State', value: detailQuery.data.agent.activationState },
                    { label: 'Strategy', value: detailQuery.data.agent.executorStrategy },
                    { label: 'Template version', value: detailQuery.data.agent.templateVersionRef },
                  ]}
                />

                {operationNote ? (
                  <div data-ui="alert" data-tone="info">
                    <div data-slot="title">Operator action</div>
                    <p data-ui="text" data-variant="body" data-tone="secondary">{operationNote}</p>
                  </div>
                ) : null}

                <PanelCard title="Lifecycle" description="Request activation changes and manage production ingress readiness.">
                  <div data-ui="form" data-layout="vertical">
                    <div className="console-two-up">
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="agent-lifecycle-summary">Summary</label>
                        <input id="agent-lifecycle-summary" data-ui="input" data-size="md" value={lifecycleSummary} onChange={(event) => setLifecycleSummary(event.target.value)} />
                      </div>
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="agent-lifecycle-justification">Justification</label>
                        <input id="agent-lifecycle-justification" data-ui="input" data-size="md" value={lifecycleJustification} onChange={(event) => setLifecycleJustification(event.target.value)} />
                      </div>
                    </div>
                    {(activateAgentMutation.error || suspendAgentMutation.error || retireAgentMutation.error) ? (
                      <ErrorPanel error={activateAgentMutation.error || suspendAgentMutation.error || retireAgentMutation.error} />
                    ) : null}
                    <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                      <button type="button" data-ui="button" data-size="md" data-variant="primary" disabled={activateAgentMutation.isPending} onClick={() => void runLifecycleAction('activate', detailQuery.data.agent.agentId)}>
                        Activate
                      </button>
                      <button type="button" data-ui="button" data-size="md" data-variant="secondary" disabled={suspendAgentMutation.isPending} onClick={() => void runLifecycleAction('suspend', detailQuery.data.agent.agentId)}>
                        Suspend
                      </button>
                      <button type="button" data-ui="button" data-size="md" data-variant="danger" disabled={retireAgentMutation.isPending} onClick={() => void runLifecycleAction('retire', detailQuery.data.agent.agentId)}>
                        Retire
                      </button>
                    </div>
                  </div>
                </PanelCard>

                <PanelCard title="Production run start" description="Start an agent-first production run with structured input.">
                  <div data-ui="form" data-layout="vertical">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="agent-run-input-text">Input text</label>
                      <textarea id="agent-run-input-text" data-ui="textarea" value={runInputText} onChange={(event) => setRunInputText(event.target.value)} />
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="agent-run-input-payload">Input payload JSON</label>
                      <textarea id="agent-run-input-payload" data-ui="textarea" value={runInputPayloadText} onChange={(event) => setRunInputPayloadText(event.target.value)} placeholder='{"subjectRef":"case-1"}' />
                    </div>
                    {runPayloadError ? <ErrorPanel title="Invalid payload" error={runPayloadError} /> : null}
                    {startAgentRunMutation.error ? <ErrorPanel error={startAgentRunMutation.error} /> : null}
                    <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                      <button type="button" data-ui="button" data-size="md" data-variant="primary" disabled={startAgentRunMutation.isPending} onClick={() => void startRun(detailQuery.data.agent.agentId)}>
                        Start production run
                      </button>
                    </div>
                  </div>
                </PanelCard>

                <PanelCard title="Trigger bindings" description="Bind schedules, webhooks, and event subscriptions to this agent.">
                  {triggerBindingsQuery.isLoading ? <LoadingPanel label="Loading trigger bindings" /> : null}
                  {triggerBindingsQuery.error ? <ErrorPanel error={triggerBindingsQuery.error} /> : null}
                  <div data-ui="stack" data-direction="col" data-gap="3">
                    <div data-ui="form" data-layout="vertical">
                      <div className="console-two-up">
                        <div data-ui="field">
                          <label data-slot="label" htmlFor="trigger-workspace-id">Workspace ID</label>
                          <input id="trigger-workspace-id" data-ui="input" data-size="md" value={triggerWorkspaceId} onChange={(event) => setTriggerWorkspaceId(event.target.value)} />
                        </div>
                        <div data-ui="field">
                          <label data-slot="label" htmlFor="trigger-kind">Trigger kind</label>
                          <select id="trigger-kind" data-ui="select" data-size="md" value={triggerKind} onChange={(event) => setTriggerKind(event.target.value as 'schedule' | 'webhook' | 'event_subscription')}>
                            <option value="schedule">schedule</option>
                            <option value="webhook">webhook</option>
                            <option value="event_subscription">event_subscription</option>
                          </select>
                        </div>
                      </div>
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="trigger-config">Config JSON</label>
                        <textarea id="trigger-config" data-ui="textarea" value={triggerConfigText} onChange={(event) => setTriggerConfigText(event.target.value)} />
                      </div>
                      {triggerConfigError ? <ErrorPanel title="Invalid trigger config" error={triggerConfigError} /> : null}
                      {(createTriggerBindingMutation.error || enableTriggerBindingMutation.error || disableTriggerBindingMutation.error) ? (
                        <ErrorPanel error={createTriggerBindingMutation.error || enableTriggerBindingMutation.error || disableTriggerBindingMutation.error} />
                      ) : null}
                      <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                        <button type="button" data-ui="button" data-size="md" data-variant="primary" disabled={createTriggerBindingMutation.isPending} onClick={() => void createTriggerBinding(detailQuery.data.agent.agentId)}>
                          Create trigger binding
                        </button>
                      </div>
                    </div>

                    {triggerBindingsQuery.data?.triggerBindings.length ? (
                      <div data-ui="list" data-variant="rows" data-density="comfortable">
                        {triggerBindingsQuery.data.triggerBindings.map((binding) => (
                          <div key={binding.triggerBindingId}>
                            <div data-ui="stack" data-direction="col" data-gap="2">
                              <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                                <div data-slot="start">
                                  <strong data-ui="text" data-variant="body" data-tone="primary">{binding.triggerKind}</strong>
                                  <span data-ui="badge" data-variant="subtle" data-tone="neutral">{binding.status}</span>
                                </div>
                                <div data-slot="end">
                                  <button type="button" data-ui="button" data-size="sm" data-variant="outlined" onClick={() => void toggleTrigger('enable', binding.triggerBindingId, detailQuery.data.agent.agentId)}>
                                    Enable
                                  </button>
                                  <button type="button" data-ui="button" data-size="sm" data-variant="outlined" onClick={() => void toggleTrigger('disable', binding.triggerBindingId, detailQuery.data.agent.agentId)}>
                                    Disable
                                  </button>
                                </div>
                              </div>
                              <span data-ui="text" data-variant="caption" data-tone="secondary">
                                {binding.triggerBindingId} · next {formatDateTime(binding.nextTriggerAt)}
                              </span>
                              <JsonPreview value={binding.configJson} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyPanel title="No trigger bindings" body="Create the first production trigger for this agent." />
                    )}
                  </div>
                </PanelCard>

                <PanelCard title="Action bindings" description="Attach capability actions to the agent's execution plan.">
                  {actionBindingsQuery.isLoading ? <LoadingPanel label="Loading action bindings" /> : null}
                  {actionBindingsQuery.error ? <ErrorPanel error={actionBindingsQuery.error} /> : null}
                  <div data-ui="form" data-layout="vertical">
                    <div className="console-two-up">
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="action-workspace-id">Workspace ID</label>
                        <input id="action-workspace-id" data-ui="input" data-size="md" value={actionWorkspaceId} onChange={(event) => setActionWorkspaceId(event.target.value)} />
                      </div>
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="action-ref">Action ref</label>
                        <input id="action-ref" data-ui="input" data-size="md" value={actionRef} onChange={(event) => setActionRef(event.target.value)} />
                      </div>
                    </div>
                    <div className="console-two-up">
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="action-connector-binding-id">Connector binding</label>
                        <select id="action-connector-binding-id" data-ui="select" data-size="md" value={connectorBindingId} onChange={(event) => setConnectorBindingId(event.target.value)}>
                          <option value="">Select connector binding</option>
                          {connectorBindingsQuery.data?.connectorBindings.map((binding) => (
                            <option key={binding.connectorBindingId} value={binding.connectorBindingId}>
                              {binding.name} · {binding.connectorBindingId}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="action-capability-id">Capability ID</label>
                        <input id="action-capability-id" data-ui="input" data-size="md" value={capabilityId} onChange={(event) => setCapabilityId(event.target.value)} />
                      </div>
                    </div>
                    <div className="console-three-up">
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="action-side-effect-class">Side effect class</label>
                        <select id="action-side-effect-class" data-ui="select" data-size="md" value={sideEffectClass} onChange={(event) => setSideEffectClass(event.target.value as 'read' | 'write')}>
                          <option value="read">read</option>
                          <option value="write">write</option>
                        </select>
                      </div>
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="action-execution-mode">Execution mode</label>
                        <select id="action-execution-mode" data-ui="select" data-size="md" value={executionMode} onChange={(event) => setExecutionMode(event.target.value as 'sync' | 'async')}>
                          <option value="sync">sync</option>
                          <option value="async">async</option>
                        </select>
                      </div>
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="action-timeout-ms">Timeout ms</label>
                        <input id="action-timeout-ms" data-ui="input" data-size="md" value={timeoutMs} onChange={(event) => setTimeoutMs(event.target.value)} />
                      </div>
                    </div>
                    <div className="console-two-up">
                      <div data-ui="field">
                        <label data-slot="label" htmlFor="action-browser-fallback-mode">Browser fallback</label>
                        <select id="action-browser-fallback-mode" data-ui="select" data-size="md" value={browserFallbackMode} onChange={(event) => setBrowserFallbackMode(event.target.value as 'disabled' | 'query_only')}>
                          <option value="disabled">disabled</option>
                          <option value="query_only">query_only</option>
                        </select>
                      </div>
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="action-config-json">Config JSON</label>
                      <textarea id="action-config-json" data-ui="textarea" value={actionConfigText} onChange={(event) => setActionConfigText(event.target.value)} />
                    </div>
                    {actionConfigError ? <ErrorPanel title="Invalid action config" error={actionConfigError} /> : null}
                    {createActionBindingMutation.error ? <ErrorPanel error={createActionBindingMutation.error} /> : null}
                    <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                      <button type="button" data-ui="button" data-size="md" data-variant="primary" disabled={createActionBindingMutation.isPending} onClick={() => void createActionBinding(detailQuery.data.agent.agentId)}>
                        Create action binding
                      </button>
                    </div>
                  </div>

                  {actionBindingsQuery.data?.actionBindings.length ? (
                    <div data-ui="list" data-variant="rows" data-density="comfortable">
                      {actionBindingsQuery.data.actionBindings.map((binding) => (
                        <div key={binding.actionBindingId}>
                          <div data-ui="stack" data-direction="col" data-gap="2">
                            <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                              <div data-slot="start">
                                <strong data-ui="text" data-variant="body" data-tone="primary">{binding.capabilityId}</strong>
                                <span data-ui="badge" data-variant="subtle" data-tone="neutral">{binding.status}</span>
                              </div>
                              <div data-slot="end">
                                <span data-ui="text" data-variant="caption" data-tone="muted">{binding.actionBindingId}</span>
                              </div>
                            </div>
                            <span data-ui="text" data-variant="caption" data-tone="secondary">
                              {binding.actionRef} · {binding.connectorBindingId} · {binding.executionMode}/{binding.sideEffectClass}
                            </span>
                            <JsonPreview value={binding.configJson} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyPanel title="No action bindings" body="Attach at least one capability action to make the agent externally useful." />
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
