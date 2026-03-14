import { useState } from 'react';
import type { ConnectorCatalog } from '@baseinterface/workflow-contracts';
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
  useActivateBridgeMutation,
  useBridgeQuery,
  useBridgesQuery,
  useConnectorBindingQuery,
  useConnectorBindingsQuery,
  useConnectorDefinitionQuery,
  useConnectorDefinitionsQuery,
  useCreateBridgeMutation,
  useCreateConnectorBindingMutation,
  useCreateConnectorDefinitionMutation,
  useCreateEventSubscriptionMutation,
  useEventSubscriptionQuery,
  useEventSubscriptionsQuery,
  useSecretRefsQuery,
  useSuspendBridgeMutation,
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

export function CapabilitiesWorkspace() {
  const connectorDefinitionsQuery = useConnectorDefinitionsQuery();
  const connectorBindingsQuery = useConnectorBindingsQuery();
  const eventSubscriptionsQuery = useEventSubscriptionsQuery();
  const bridgesQuery = useBridgesQuery();
  const secretRefsQuery = useSecretRefsQuery();

  const [selectedConnectorDefinitionId, setSelectedConnectorDefinitionId] = useState<string | undefined>();
  const [selectedConnectorBindingId, setSelectedConnectorBindingId] = useState<string | undefined>();
  const [selectedEventSubscriptionId, setSelectedEventSubscriptionId] = useState<string | undefined>();
  const [selectedBridgeId, setSelectedBridgeId] = useState<string | undefined>();

  const connectorDefinitionDetailQuery = useConnectorDefinitionQuery(selectedConnectorDefinitionId);
  const connectorBindingDetailQuery = useConnectorBindingQuery(selectedConnectorBindingId);
  const eventSubscriptionDetailQuery = useEventSubscriptionQuery(selectedEventSubscriptionId);
  const bridgeDetailQuery = useBridgeQuery(selectedBridgeId);

  const createConnectorDefinitionMutation = useCreateConnectorDefinitionMutation();
  const createConnectorBindingMutation = useCreateConnectorBindingMutation();
  const createEventSubscriptionMutation = useCreateEventSubscriptionMutation();
  const createBridgeMutation = useCreateBridgeMutation();
  const activateBridgeMutation = useActivateBridgeMutation();
  const suspendBridgeMutation = useSuspendBridgeMutation();

  const [connectorDefinitionWorkspaceId, setConnectorDefinitionWorkspaceId] = useState('workspace-1');
  const [connectorKey, setConnectorKey] = useState('');
  const [connectorName, setConnectorName] = useState('');
  const [connectorDescription, setConnectorDescription] = useState('');
  const [catalogJsonText, setCatalogJsonText] = useState('{ "actions": [], "events": [] }');
  const [connectorDefinitionError, setConnectorDefinitionError] = useState<string | undefined>();

  const [connectorBindingWorkspaceId, setConnectorBindingWorkspaceId] = useState('workspace-1');
  const [connectorDefinitionId, setConnectorDefinitionId] = useState('');
  const [connectorBindingName, setConnectorBindingName] = useState('');
  const [connectorBindingDescription, setConnectorBindingDescription] = useState('');
  const [connectorSecretRefId, setConnectorSecretRefId] = useState('');
  const [connectorBindingMetadataText, setConnectorBindingMetadataText] = useState('{}');
  const [connectorBindingError, setConnectorBindingError] = useState<string | undefined>();

  const [eventWorkspaceId, setEventWorkspaceId] = useState('workspace-1');
  const [eventConnectorBindingId, setEventConnectorBindingId] = useState('');
  const [eventTriggerBindingId, setEventTriggerBindingId] = useState('');
  const [eventType, setEventType] = useState('');
  const [eventConfigText, setEventConfigText] = useState('{}');
  const [eventConfigError, setEventConfigError] = useState<string | undefined>();

  const [bridgeWorkspaceId, setBridgeWorkspaceId] = useState('workspace-1');
  const [bridgeName, setBridgeName] = useState('');
  const [bridgeDescription, setBridgeDescription] = useState('');
  const [bridgeBaseUrl, setBridgeBaseUrl] = useState('');
  const [bridgeServiceId, setBridgeServiceId] = useState('');
  const [bridgeAuthConfigText, setBridgeAuthConfigText] = useState('{}');
  const [bridgeCallbackConfigText, setBridgeCallbackConfigText] = useState('{}');
  const [bridgeConfigError, setBridgeConfigError] = useState<string | undefined>();
  const [bridgeLifecycleSummary, setBridgeLifecycleSummary] = useState('');
  const [bridgeLifecycleJustification, setBridgeLifecycleJustification] = useState('');
  const [operationNote, setOperationNote] = useState<string | undefined>();

  async function createConnectorDefinition(): Promise<void> {
    try {
      const catalogJson = (parseOptionalJson(catalogJsonText) || { actions: [], events: [] }) as ConnectorCatalog;
      setConnectorDefinitionError(undefined);
      const response = await createConnectorDefinitionMutation.mutateAsync({
        workspaceId: connectorDefinitionWorkspaceId.trim(),
        connectorKey: connectorKey.trim(),
        name: connectorName.trim(),
        description: connectorDescription.trim() || undefined,
        catalogJson,
      });
      setSelectedConnectorDefinitionId(response.connectorDefinition.connectorDefinitionId);
      setOperationNote(`Created connector definition ${response.connectorDefinition.connectorDefinitionId}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        setConnectorDefinitionError(error.message);
        return;
      }
      throw error;
    }
  }

  async function createConnectorBinding(): Promise<void> {
    try {
      const metadataJson = parseOptionalJson(connectorBindingMetadataText);
      setConnectorBindingError(undefined);
      const response = await createConnectorBindingMutation.mutateAsync({
        workspaceId: connectorBindingWorkspaceId.trim(),
        connectorDefinitionId: connectorDefinitionId.trim(),
        name: connectorBindingName.trim(),
        description: connectorBindingDescription.trim() || undefined,
        secretRefId: connectorSecretRefId.trim() || undefined,
        metadataJson,
      });
      setSelectedConnectorBindingId(response.connectorBinding.connectorBindingId);
      setOperationNote(`Created connector binding ${response.connectorBinding.connectorBindingId}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        setConnectorBindingError(error.message);
        return;
      }
      throw error;
    }
  }

  async function createEventSubscription(): Promise<void> {
    try {
      const configJson = parseOptionalJson(eventConfigText);
      setEventConfigError(undefined);
      const response = await createEventSubscriptionMutation.mutateAsync({
        workspaceId: eventWorkspaceId.trim(),
        connectorBindingId: eventConnectorBindingId.trim(),
        triggerBindingId: eventTriggerBindingId.trim(),
        eventType: eventType.trim(),
        configJson,
      });
      setSelectedEventSubscriptionId(response.eventSubscription.eventSubscriptionId);
      setOperationNote(`Created event subscription ${response.eventSubscription.eventSubscriptionId}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        setEventConfigError(error.message);
        return;
      }
      throw error;
    }
  }

  async function createBridge(): Promise<void> {
    try {
      const authConfigJson = parseOptionalJson(bridgeAuthConfigText);
      const callbackConfigJson = parseOptionalJson(bridgeCallbackConfigText);
      setBridgeConfigError(undefined);
      const response = await createBridgeMutation.mutateAsync({
        workspaceId: bridgeWorkspaceId.trim(),
        name: bridgeName.trim(),
        description: bridgeDescription.trim() || undefined,
        baseUrl: bridgeBaseUrl.trim(),
        serviceId: bridgeServiceId.trim(),
        authConfigJson,
        callbackConfigJson,
      });
      setSelectedBridgeId(response.bridge.bridgeId);
      setOperationNote(`Created bridge ${response.bridge.bridgeId}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        setBridgeConfigError(error.message);
        return;
      }
      throw error;
    }
  }

  async function runBridgeLifecycle(action: 'activate' | 'suspend', bridgeId: string): Promise<void> {
    const response = action === 'activate'
      ? await activateBridgeMutation.mutateAsync({
        bridgeId,
        summary: bridgeLifecycleSummary.trim() || undefined,
        justification: bridgeLifecycleJustification.trim() || undefined,
      })
      : await suspendBridgeMutation.mutateAsync({
        bridgeId,
        summary: bridgeLifecycleSummary.trim() || undefined,
        justification: bridgeLifecycleJustification.trim() || undefined,
      });
    setOperationNote(`${action}d bridge ${response.bridge.bridgeId}`);
  }

  return (
    <div data-ui="stack" data-direction="col" data-gap="4" className="console-route-layout">
      <PanelCard
        title="Capabilities"
        description="Manage connector definitions, connector bindings, event subscriptions, and bridge registrations."
      >
        <SummaryGrid
          items={[
            { label: 'Connector definitions', value: connectorDefinitionsQuery.data?.connectorDefinitions.length || 0 },
            { label: 'Connector bindings', value: connectorBindingsQuery.data?.connectorBindings.length || 0 },
            { label: 'Event subscriptions', value: eventSubscriptionsQuery.data?.eventSubscriptions.length || 0 },
            { label: 'Bridges', value: bridgesQuery.data?.bridges.length || 0 },
          ]}
        />

        {operationNote ? (
          <div data-ui="alert" data-tone="info">
            <div data-slot="title">Capability action</div>
            <p data-ui="text" data-variant="body" data-tone="secondary">{operationNote}</p>
          </div>
        ) : null}

        <div data-ui="stack" data-direction="col" data-gap="4">
          <PanelCard title="Connector definitions" description="Registry entries for connector catalogs and capability metadata.">
            <div className="console-two-up">
              <div data-ui="stack" data-direction="col" data-gap="3">
                {connectorDefinitionsQuery.isLoading ? <LoadingPanel label="Loading connector definitions" /> : null}
                {connectorDefinitionsQuery.error ? <ErrorPanel error={connectorDefinitionsQuery.error} /> : null}
                <div data-ui="list" data-variant="rows" data-density="comfortable">
                  {connectorDefinitionsQuery.data?.connectorDefinitions.map((definition) => (
                    <div key={definition.connectorDefinitionId}>
                      <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                        <div data-slot="start">
                          <button type="button" data-ui="button" data-size="sm" data-variant="outlined" onClick={() => setSelectedConnectorDefinitionId(definition.connectorDefinitionId)}>
                            {definition.name}
                          </button>
                        </div>
                        <div data-slot="end">
                          <span data-ui="badge" data-variant="subtle" data-tone="neutral">{definition.status}</span>
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
                      <label data-slot="label" htmlFor="connector-definition-workspace-id">Workspace ID</label>
                      <input id="connector-definition-workspace-id" data-ui="input" data-size="md" value={connectorDefinitionWorkspaceId} onChange={(event) => setConnectorDefinitionWorkspaceId(event.target.value)} />
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="connector-definition-key">Connector key</label>
                      <input id="connector-definition-key" data-ui="input" data-size="md" value={connectorKey} onChange={(event) => setConnectorKey(event.target.value)} />
                    </div>
                  </div>
                  <div className="console-two-up">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="connector-definition-name">Name</label>
                      <input id="connector-definition-name" data-ui="input" data-size="md" value={connectorName} onChange={(event) => setConnectorName(event.target.value)} />
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="connector-definition-description">Description</label>
                      <input id="connector-definition-description" data-ui="input" data-size="md" value={connectorDescription} onChange={(event) => setConnectorDescription(event.target.value)} />
                    </div>
                  </div>
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="connector-definition-catalog-json">Catalog JSON</label>
                    <textarea id="connector-definition-catalog-json" data-ui="textarea" value={catalogJsonText} onChange={(event) => setCatalogJsonText(event.target.value)} />
                  </div>
                  {connectorDefinitionError ? <ErrorPanel title="Invalid catalog JSON" error={connectorDefinitionError} /> : null}
                  {createConnectorDefinitionMutation.error ? <ErrorPanel error={createConnectorDefinitionMutation.error} /> : null}
                  <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                    <button type="button" data-ui="button" data-size="md" data-variant="primary" disabled={createConnectorDefinitionMutation.isPending} onClick={() => void createConnectorDefinition()}>
                      Create connector definition
                    </button>
                  </div>
                </div>

                {selectedConnectorDefinitionId ? (
                  connectorDefinitionDetailQuery.isLoading ? <LoadingPanel label="Loading connector definition detail" /> : connectorDefinitionDetailQuery.data ? (
                    <JsonPreview value={connectorDefinitionDetailQuery.data.connectorDefinition} />
                  ) : null
                ) : (
                  <EmptyPanel title="No connector definition selected" body="Choose a connector definition to inspect its catalog." />
                )}
              </div>
            </div>
          </PanelCard>

          <PanelCard title="Connector bindings" description="Workspace-owned connector instances and their secret attachments.">
            <div className="console-two-up">
              <div data-ui="stack" data-direction="col" data-gap="3">
                {connectorBindingsQuery.isLoading ? <LoadingPanel label="Loading connector bindings" /> : null}
                {connectorBindingsQuery.error ? <ErrorPanel error={connectorBindingsQuery.error} /> : null}
                <div data-ui="list" data-variant="rows" data-density="comfortable">
                  {connectorBindingsQuery.data?.connectorBindings.map((binding) => (
                    <div key={binding.connectorBindingId}>
                      <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                        <div data-slot="start">
                          <button type="button" data-ui="button" data-size="sm" data-variant="outlined" onClick={() => setSelectedConnectorBindingId(binding.connectorBindingId)}>
                            {binding.name}
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
                      <label data-slot="label" htmlFor="connector-binding-workspace-id">Workspace ID</label>
                      <input id="connector-binding-workspace-id" data-ui="input" data-size="md" value={connectorBindingWorkspaceId} onChange={(event) => setConnectorBindingWorkspaceId(event.target.value)} />
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="connector-binding-definition-id">Connector definition</label>
                      <select id="connector-binding-definition-id" data-ui="select" data-size="md" value={connectorDefinitionId} onChange={(event) => setConnectorDefinitionId(event.target.value)}>
                        <option value="">Select connector definition</option>
                        {connectorDefinitionsQuery.data?.connectorDefinitions.map((definition) => (
                          <option key={definition.connectorDefinitionId} value={definition.connectorDefinitionId}>
                            {definition.name} · {definition.connectorDefinitionId}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="console-two-up">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="connector-binding-name">Name</label>
                      <input id="connector-binding-name" data-ui="input" data-size="md" value={connectorBindingName} onChange={(event) => setConnectorBindingName(event.target.value)} />
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="connector-binding-description">Description</label>
                      <input id="connector-binding-description" data-ui="input" data-size="md" value={connectorBindingDescription} onChange={(event) => setConnectorBindingDescription(event.target.value)} />
                    </div>
                  </div>
                  <div className="console-two-up">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="connector-binding-secret-ref">Secret ref</label>
                      <select id="connector-binding-secret-ref" data-ui="select" data-size="md" value={connectorSecretRefId} onChange={(event) => setConnectorSecretRefId(event.target.value)}>
                        <option value="">None</option>
                        {secretRefsQuery.data?.secretRefs.map((secretRef) => (
                          <option key={secretRef.secretRefId} value={secretRef.secretRefId}>
                            {secretRef.providerType} · {secretRef.secretRefId}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="connector-binding-metadata-json">Metadata JSON</label>
                    <textarea id="connector-binding-metadata-json" data-ui="textarea" value={connectorBindingMetadataText} onChange={(event) => setConnectorBindingMetadataText(event.target.value)} />
                  </div>
                  {connectorBindingError ? <ErrorPanel title="Invalid binding JSON" error={connectorBindingError} /> : null}
                  {createConnectorBindingMutation.error ? <ErrorPanel error={createConnectorBindingMutation.error} /> : null}
                  <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                    <button type="button" data-ui="button" data-size="md" data-variant="primary" disabled={createConnectorBindingMutation.isPending} onClick={() => void createConnectorBinding()}>
                      Create connector binding
                    </button>
                  </div>
                </div>

                {selectedConnectorBindingId ? (
                  connectorBindingDetailQuery.isLoading ? <LoadingPanel label="Loading connector binding detail" /> : connectorBindingDetailQuery.data ? (
                    <JsonPreview value={connectorBindingDetailQuery.data.connectorBinding} />
                  ) : null
                ) : (
                  <EmptyPanel title="No connector binding selected" body="Choose a binding to inspect secret linkage and metadata." />
                )}
              </div>
            </div>
          </PanelCard>

          <PanelCard title="Event subscriptions" description="Wire connector events into trigger bindings owned by the operator control plane.">
            <div className="console-two-up">
              <div data-ui="stack" data-direction="col" data-gap="3">
                {eventSubscriptionsQuery.isLoading ? <LoadingPanel label="Loading event subscriptions" /> : null}
                {eventSubscriptionsQuery.error ? <ErrorPanel error={eventSubscriptionsQuery.error} /> : null}
                <div data-ui="list" data-variant="rows" data-density="comfortable">
                  {eventSubscriptionsQuery.data?.eventSubscriptions.map((subscription) => (
                    <div key={subscription.eventSubscriptionId}>
                      <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                        <div data-slot="start">
                          <button type="button" data-ui="button" data-size="sm" data-variant="outlined" onClick={() => setSelectedEventSubscriptionId(subscription.eventSubscriptionId)}>
                            {subscription.eventType}
                          </button>
                        </div>
                        <div data-slot="end">
                          <span data-ui="badge" data-variant="subtle" data-tone="neutral">{subscription.status}</span>
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
                      <label data-slot="label" htmlFor="event-workspace-id">Workspace ID</label>
                      <input id="event-workspace-id" data-ui="input" data-size="md" value={eventWorkspaceId} onChange={(event) => setEventWorkspaceId(event.target.value)} />
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="event-connector-binding-id">Connector binding</label>
                      <select id="event-connector-binding-id" data-ui="select" data-size="md" value={eventConnectorBindingId} onChange={(event) => setEventConnectorBindingId(event.target.value)}>
                        <option value="">Select connector binding</option>
                        {connectorBindingsQuery.data?.connectorBindings.map((binding) => (
                          <option key={binding.connectorBindingId} value={binding.connectorBindingId}>
                            {binding.name} · {binding.connectorBindingId}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="console-two-up">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="event-trigger-binding-id">Trigger binding ID</label>
                      <input id="event-trigger-binding-id" data-ui="input" data-size="md" value={eventTriggerBindingId} onChange={(event) => setEventTriggerBindingId(event.target.value)} />
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="event-type">Event type</label>
                      <input id="event-type" data-ui="input" data-size="md" value={eventType} onChange={(event) => setEventType(event.target.value)} />
                    </div>
                  </div>
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="event-config-json">Config JSON</label>
                    <textarea id="event-config-json" data-ui="textarea" value={eventConfigText} onChange={(event) => setEventConfigText(event.target.value)} />
                  </div>
                  {eventConfigError ? <ErrorPanel title="Invalid event config" error={eventConfigError} /> : null}
                  {createEventSubscriptionMutation.error ? <ErrorPanel error={createEventSubscriptionMutation.error} /> : null}
                  <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                    <button type="button" data-ui="button" data-size="md" data-variant="primary" disabled={createEventSubscriptionMutation.isPending} onClick={() => void createEventSubscription()}>
                      Create event subscription
                    </button>
                  </div>
                </div>

                {selectedEventSubscriptionId ? (
                  eventSubscriptionDetailQuery.isLoading ? <LoadingPanel label="Loading event subscription detail" /> : eventSubscriptionDetailQuery.data ? (
                    <JsonPreview value={eventSubscriptionDetailQuery.data.eventSubscription} />
                  ) : null
                ) : (
                  <EmptyPanel title="No event subscription selected" body="Choose an event subscription to inspect trigger linkage." />
                )}
              </div>
            </div>
          </PanelCard>

          <PanelCard title="Bridge registrations" description="Register external runtimes and manage bridge health lifecycle." footer={(
            <div data-ui="toolbar" data-align="start" data-wrap="wrap">
              <div data-ui="field">
                <label data-slot="label" htmlFor="bridge-lifecycle-summary">Summary</label>
                <input id="bridge-lifecycle-summary" data-ui="input" data-size="md" value={bridgeLifecycleSummary} onChange={(event) => setBridgeLifecycleSummary(event.target.value)} />
              </div>
              <div data-ui="field">
                <label data-slot="label" htmlFor="bridge-lifecycle-justification">Justification</label>
                <input id="bridge-lifecycle-justification" data-ui="input" data-size="md" value={bridgeLifecycleJustification} onChange={(event) => setBridgeLifecycleJustification(event.target.value)} />
              </div>
            </div>
          )}>
            <div className="console-two-up">
              <div data-ui="stack" data-direction="col" data-gap="3">
                {bridgesQuery.isLoading ? <LoadingPanel label="Loading bridges" /> : null}
                {bridgesQuery.error ? <ErrorPanel error={bridgesQuery.error} /> : null}
                <div data-ui="list" data-variant="rows" data-density="comfortable">
                  {bridgesQuery.data?.bridges.map((bridge) => (
                    <div key={bridge.bridgeId}>
                      <div data-ui="stack" data-direction="col" data-gap="2">
                        <div data-ui="toolbar" data-align="between" data-wrap="wrap">
                          <div data-slot="start">
                            <button type="button" data-ui="button" data-size="sm" data-variant="outlined" onClick={() => setSelectedBridgeId(bridge.bridgeId)}>
                              {bridge.name}
                            </button>
                          </div>
                          <div data-slot="end">
                            <span data-ui="badge" data-variant="subtle" data-tone="neutral">{bridge.status}</span>
                          </div>
                        </div>
                        <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                          <button type="button" data-ui="button" data-size="sm" data-variant="outlined" onClick={() => void runBridgeLifecycle('activate', bridge.bridgeId)}>
                            Activate
                          </button>
                          <button type="button" data-ui="button" data-size="sm" data-variant="outlined" onClick={() => void runBridgeLifecycle('suspend', bridge.bridgeId)}>
                            Suspend
                          </button>
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
                      <label data-slot="label" htmlFor="bridge-workspace-id">Workspace ID</label>
                      <input id="bridge-workspace-id" data-ui="input" data-size="md" value={bridgeWorkspaceId} onChange={(event) => setBridgeWorkspaceId(event.target.value)} />
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="bridge-name">Name</label>
                      <input id="bridge-name" data-ui="input" data-size="md" value={bridgeName} onChange={(event) => setBridgeName(event.target.value)} />
                    </div>
                  </div>
                  <div className="console-two-up">
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="bridge-description">Description</label>
                      <input id="bridge-description" data-ui="input" data-size="md" value={bridgeDescription} onChange={(event) => setBridgeDescription(event.target.value)} />
                    </div>
                    <div data-ui="field">
                      <label data-slot="label" htmlFor="bridge-service-id">Service ID</label>
                      <input id="bridge-service-id" data-ui="input" data-size="md" value={bridgeServiceId} onChange={(event) => setBridgeServiceId(event.target.value)} />
                    </div>
                  </div>
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="bridge-base-url">Base URL</label>
                    <input id="bridge-base-url" data-ui="input" data-size="md" value={bridgeBaseUrl} onChange={(event) => setBridgeBaseUrl(event.target.value)} />
                  </div>
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="bridge-auth-config">Auth config JSON</label>
                    <textarea id="bridge-auth-config" data-ui="textarea" value={bridgeAuthConfigText} onChange={(event) => setBridgeAuthConfigText(event.target.value)} />
                  </div>
                  <div data-ui="field">
                    <label data-slot="label" htmlFor="bridge-callback-config">Callback config JSON</label>
                    <textarea id="bridge-callback-config" data-ui="textarea" value={bridgeCallbackConfigText} onChange={(event) => setBridgeCallbackConfigText(event.target.value)} />
                  </div>
                  {bridgeConfigError ? <ErrorPanel title="Invalid bridge config" error={bridgeConfigError} /> : null}
                  {(createBridgeMutation.error || activateBridgeMutation.error || suspendBridgeMutation.error) ? (
                    <ErrorPanel error={createBridgeMutation.error || activateBridgeMutation.error || suspendBridgeMutation.error} />
                  ) : null}
                  <div data-ui="toolbar" data-align="start" data-wrap="wrap">
                    <button type="button" data-ui="button" data-size="md" data-variant="primary" disabled={createBridgeMutation.isPending} onClick={() => void createBridge()}>
                      Create bridge
                    </button>
                  </div>
                </div>

                {selectedBridgeId ? (
                  bridgeDetailQuery.isLoading ? <LoadingPanel label="Loading bridge detail" /> : bridgeDetailQuery.data ? (
                    <div data-ui="stack" data-direction="col" data-gap="2">
                      <SummaryGrid
                        items={[
                          { label: 'Bridge', value: bridgeDetailQuery.data.bridge.name, helper: bridgeDetailQuery.data.bridge.bridgeId },
                          { label: 'Status', value: bridgeDetailQuery.data.bridge.status },
                          { label: 'Runtime', value: bridgeDetailQuery.data.bridge.runtimeType },
                          { label: 'Health check', value: formatDateTime(bridgeDetailQuery.data.bridge.lastHealthAt) },
                        ]}
                      />
                      <JsonPreview value={bridgeDetailQuery.data.bridge} />
                    </div>
                  ) : null
                ) : (
                  <EmptyPanel title="No bridge selected" body="Choose a bridge to inspect manifest, auth, and callback configuration." />
                )}
              </div>
            </div>
          </PanelCard>
        </div>
      </PanelCard>
    </div>
  );
}
