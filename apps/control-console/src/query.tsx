import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  ActionBindingCreateRequest,
  AgentDefinitionCreateRequest,
  AgentDefinitionLifecycleRequest,
  AgentDefinitionResponse,
  AgentRunStartRequest,
  BridgeRegistrationCreateRequest,
  BridgeRegistrationLifecycleRequest,
  BridgeRegistrationResponse,
  ConnectorBindingCreateRequest,
  ConnectorDefinitionCreateRequest,
  EventSubscriptionCreateRequest,
  GovernanceChangeDecisionRequest,
  GovernanceChangeDecisionResponse,
  GovernanceChangeRequestCreateRequest,
  PolicyBindingCreateRequest,
  SecretRefCreateRequest,
  TriggerBindingCreateRequest,
  TriggerBindingLifecycleRequest,
  TriggerBindingResponse,
  WorkflowDraftCreateRequest,
  WorkflowDraftFocusRequest,
  WorkflowDraftIntakeRequest,
  WorkflowDraftPublishRequest,
  WorkflowDraftSpecPatchRequest,
  WorkflowVersionRunStartRequest,
} from '@baseinterface/workflow-contracts';
import {
  buildConsoleStreamUrl,
  getActionBinding,
  getActionBindings,
  getAgent,
  getAgents,
  getApprovalDetail,
  getApprovalQueue,
  getArtifact,
  getBridge,
  getBridges,
  getConnectorBinding,
  getConnectorBindings,
  getConnectorDefinition,
  getConnectorDefinitions,
  getDraft,
  getDrafts,
  getEventSubscription,
  getEventSubscriptions,
  getGovernanceRequest,
  getGovernanceRequests,
  getPolicyBindings,
  getRun,
  getRuns,
  getScopeGrants,
  getSecretRefs,
  getTemplate,
  getTemplates,
  getTriggerBindings,
  parseConsoleStreamEnvelope,
  patchDraftSpec,
  postActivateAgent,
  postActivateBridge,
  postApprovalDecision,
  postApproveGovernanceRequest,
  postCreateActionBinding,
  postCreateAgent,
  postCreateBridge,
  postCreateConnectorBinding,
  postCreateConnectorDefinition,
  postCreateDraft,
  postCreateEventSubscription,
  postCreateGovernanceRequest,
  postCreatePolicyBinding,
  postCreateSecretRef,
  postCreateTriggerBinding,
  postDisableTriggerBinding,
  postDraftIntake,
  postDraftPublish,
  postDraftSynthesize,
  postDraftValidate,
  postEnableTriggerBinding,
  postFocusDraft,
  postRejectGovernanceRequest,
  postRetireAgent,
  postStartAgentRun,
  postStartDebugRun,
  postSuspendAgent,
  postSuspendBridge,
  queryKeys,
} from './api';
import {
  CONTROL_CONSOLE_POLLING_MS,
  CONTROL_CONSOLE_STREAM_RETRY_MS,
  CONTROL_CONSOLE_STREAM_STALE_MS,
  type ControlConsolePollKey,
} from './config';
import { createTraceId, readOrCreateIdentity, type ControlConsoleIdentity } from './session';

export type ControlConsoleStreamMode = 'connecting' | 'sse' | 'polling';

type EventSourceLike = {
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  close: () => void;
};

type EventSourceFactory = (url: string) => EventSourceLike;

type ControlConsoleEnvironmentValue = {
  identity: ControlConsoleIdentity;
  streamMode: ControlConsoleStreamMode;
};

const defaultQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
    mutations: {
      retry: false,
    },
  },
});

const ControlConsoleEnvironmentContext = createContext<ControlConsoleEnvironmentValue | null>(null);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: defaultQueryClient.getDefaultOptions(),
  });
}

function invalidateForStreamEvent(queryClient: QueryClient, rawMessage: string): void {
  const envelope = parseConsoleStreamEnvelope(rawMessage);
  if (!envelope) {
    return;
  }

  const { event } = envelope;
  if (event.kind === 'run.updated') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.runs });
  }
  if (event.kind === 'approval.updated') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.approvals });
  }
  if (event.kind === 'draft.updated') {
    void queryClient.invalidateQueries({ queryKey: ['drafts'] });
  }
  if (event.kind === 'artifact.updated') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.runs });
    if (event.artifactId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.artifact(event.artifactId) });
    }
  }
}

function defaultEventSourceFactory(url: string): EventSourceLike {
  return new EventSource(url);
}

async function invalidateConsoleData(queryClient: QueryClient, keys: ReadonlyArray<readonly unknown[]>): Promise<void> {
  await Promise.all(keys.map(async (queryKey) => {
    await queryClient.invalidateQueries({ queryKey });
  }));
}

function useActorIdentity() {
  const { identity } = useControlConsoleEnvironment();
  return {
    sessionId: identity.sessionId,
    userId: identity.userId,
  };
}

export function ControlConsoleProviders(
  props: PropsWithChildren<{
    queryClient?: QueryClient;
    eventSourceFactory?: EventSourceFactory;
  }>,
) {
  const [identity] = useState(() => readOrCreateIdentity());
  const [streamMode, setStreamMode] = useState<ControlConsoleStreamMode>('connecting');
  const [streamAttempt, setStreamAttempt] = useState(0);
  const queryClientRef = useRef(props.queryClient || createQueryClient());
  const eventSourceFactory = props.eventSourceFactory || defaultEventSourceFactory;

  useEffect(() => {
    if (typeof window === 'undefined') {
      setStreamMode('polling');
      return;
    }
    if (!props.eventSourceFactory && typeof EventSource === 'undefined') {
      setStreamMode('polling');
      return;
    }

    let stream: EventSourceLike;
    let staleTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectScheduled = false;
    const scheduleReconnect = (): void => {
      if (reconnectScheduled) {
        return;
      }
      reconnectScheduled = true;
      reconnectTimer = setTimeout(() => {
        reconnectScheduled = false;
        setStreamAttempt((attempt) => attempt + 1);
      }, CONTROL_CONSOLE_STREAM_RETRY_MS);
    };
    const armStaleTimer = (): void => {
      if (staleTimer) {
        clearTimeout(staleTimer);
      }
      staleTimer = setTimeout(() => {
        setStreamMode('polling');
        stream.close();
        scheduleReconnect();
      }, CONTROL_CONSOLE_STREAM_STALE_MS);
    };
    try {
      stream = eventSourceFactory(buildConsoleStreamUrl());
    } catch {
      setStreamMode('polling');
      return;
    }
    armStaleTimer();
    stream.onopen = () => {
      setStreamMode('sse');
      armStaleTimer();
    };
    stream.onerror = () => {
      if (staleTimer) {
        clearTimeout(staleTimer);
      }
      setStreamMode('polling');
      stream.close();
      scheduleReconnect();
    };
    stream.onmessage = (event) => {
      armStaleTimer();
      setStreamMode('sse');
      invalidateForStreamEvent(queryClientRef.current, event.data);
    };

    return () => {
      if (staleTimer) {
        clearTimeout(staleTimer);
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      stream.close();
    };
  }, [eventSourceFactory, props.eventSourceFactory, streamAttempt]);

  return (
    <QueryClientProvider client={queryClientRef.current}>
      <ControlConsoleEnvironmentContext.Provider value={{ identity, streamMode }}>
        {props.children}
      </ControlConsoleEnvironmentContext.Provider>
    </QueryClientProvider>
  );
}

export function useControlConsoleEnvironment(): ControlConsoleEnvironmentValue {
  const context = useContext(ControlConsoleEnvironmentContext);
  if (!context) {
    throw new Error('control console environment is not available');
  }
  return context;
}

export function useAdaptivePollingInterval(key: ControlConsolePollKey): number | false {
  const { streamMode } = useControlConsoleEnvironment();
  return streamMode === 'polling' ? CONTROL_CONSOLE_POLLING_MS[key] : false;
}

export function useTemplatesQuery() {
  return useQuery({
    queryKey: queryKeys.templates,
    queryFn: getTemplates,
  });
}

export function useTemplateDetailQuery(workflowId?: string) {
  return useQuery({
    queryKey: workflowId ? queryKeys.template(workflowId) : ['templates', 'detail', 'empty'],
    queryFn: () => getTemplate(String(workflowId)),
    enabled: Boolean(workflowId),
  });
}

export function useStartDebugRunMutation() {
  const queryClient = useQueryClient();
  const { sessionId, userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: Omit<WorkflowVersionRunStartRequest, 'schemaVersion' | 'traceId' | 'sessionId' | 'userId'>) => (
      await postStartDebugRun({
        schemaVersion: 'v1',
        traceId: createTraceId(),
        sessionId,
        userId,
        ...input,
      })
    ),
    onSuccess: async () => {
      await invalidateConsoleData(queryClient, [queryKeys.runs, queryKeys.templates]);
    },
  });
}

export function useRunsQuery(limit = 30) {
  const refetchInterval = useAdaptivePollingInterval('runs');
  return useQuery({
    queryKey: queryKeys.runs,
    queryFn: () => getRuns(limit),
    refetchInterval,
  });
}

export function useRunQuery(runId?: string) {
  const refetchInterval = useAdaptivePollingInterval('runs');
  return useQuery({
    queryKey: runId ? queryKeys.run(runId) : ['runs', 'detail', 'empty'],
    queryFn: () => getRun(String(runId)),
    enabled: Boolean(runId),
    refetchInterval,
  });
}

export function useApprovalQueueQuery() {
  const refetchInterval = useAdaptivePollingInterval('approvals');
  return useQuery({
    queryKey: queryKeys.approvals,
    queryFn: getApprovalQueue,
    refetchInterval,
  });
}

export function useApprovalDetailQuery(approvalRequestId?: string) {
  const refetchInterval = useAdaptivePollingInterval('approvals');
  return useQuery({
    queryKey: approvalRequestId ? queryKeys.approval(approvalRequestId) : ['approvals', 'detail', 'empty'],
    queryFn: () => getApprovalDetail(String(approvalRequestId)),
    enabled: Boolean(approvalRequestId),
    refetchInterval,
  });
}

export function useArtifactDetailQuery(artifactId?: string, enabled = true) {
  const refetchInterval = useAdaptivePollingInterval('runs');
  return useQuery({
    queryKey: artifactId ? queryKeys.artifact(artifactId) : ['artifacts', 'detail', 'empty'],
    queryFn: () => getArtifact(String(artifactId)),
    enabled: Boolean(artifactId) && enabled,
    refetchInterval: enabled ? refetchInterval : false,
  });
}

export function useApprovalDecisionMutation() {
  const queryClient = useQueryClient();
  const { userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: { approvalRequestId: string; decision: 'approved' | 'rejected'; comment?: string }) => (
      await postApprovalDecision(input.approvalRequestId, {
        schemaVersion: 'v1',
        traceId: createTraceId(),
        userId,
        decision: input.decision,
        comment: input.comment,
      })
    ),
    onSuccess: async () => {
      await invalidateConsoleData(queryClient, [queryKeys.approvals, queryKeys.runs]);
    },
  });
}

export function useDraftListQuery(scope: 'all' | string) {
  const refetchInterval = useAdaptivePollingInterval('drafts');
  return useQuery({
    queryKey: queryKeys.drafts(scope),
    queryFn: () => getDrafts(scope === 'all' ? undefined : scope),
    refetchInterval,
  });
}

export function useDraftDetailQuery(draftId: string | undefined, scope: 'all' | string) {
  const refetchInterval = useAdaptivePollingInterval('drafts');
  return useQuery({
    queryKey: draftId ? queryKeys.draft(draftId, scope) : ['drafts', scope, 'detail', 'empty'],
    queryFn: () => getDraft(String(draftId), scope === 'all' ? undefined : scope),
    enabled: Boolean(draftId),
    refetchInterval,
  });
}

export function useCreateDraftMutation() {
  const queryClient = useQueryClient();
  const { sessionId, userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: Omit<WorkflowDraftCreateRequest, 'schemaVersion' | 'sessionId' | 'userId'>) => (
      await postCreateDraft({
        schemaVersion: 'v1',
        sessionId,
        userId,
        ...input,
      })
    ),
    onSuccess: async () => {
      await invalidateConsoleData(queryClient, [queryKeys.drafts('all'), queryKeys.drafts(sessionId)]);
    },
  });
}

export function useFocusDraftMutation() {
  const queryClient = useQueryClient();
  const { sessionId, userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: { draftId: string; body?: Partial<WorkflowDraftFocusRequest> }) => (
      await postFocusDraft(input.draftId, {
        schemaVersion: 'v1',
        sessionId: input.body?.sessionId || sessionId,
        userId: input.body?.userId || userId,
      })
    ),
    onSuccess: async () => {
      await invalidateConsoleData(queryClient, [queryKeys.drafts('all'), queryKeys.drafts(sessionId)]);
    },
  });
}

export function useDraftIntakeMutation() {
  const queryClient = useQueryClient();
  const { sessionId, userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: { draftId: string; text: string }) => (
      await postDraftIntake(input.draftId, {
        schemaVersion: 'v1',
        sessionId,
        userId,
        text: input.text,
      })
    ),
    onSuccess: async (_response, input) => {
      await invalidateConsoleData(queryClient, [
        queryKeys.drafts('all'),
        queryKeys.drafts(sessionId),
        queryKeys.draft(input.draftId, sessionId),
      ]);
    },
  });
}

export function useDraftSynthesizeMutation() {
  const queryClient = useQueryClient();
  const { sessionId, userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (draftId: string) => (
      await postDraftSynthesize(draftId, {
        schemaVersion: 'v1',
        sessionId,
        userId,
      })
    ),
    onSuccess: async (_response, draftId) => {
      await invalidateConsoleData(queryClient, [
        queryKeys.drafts('all'),
        queryKeys.drafts(sessionId),
        queryKeys.draft(draftId, sessionId),
      ]);
    },
  });
}

export function useDraftValidateMutation() {
  const queryClient = useQueryClient();
  const { sessionId, userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (draftId: string) => (
      await postDraftValidate(draftId, {
        schemaVersion: 'v1',
        sessionId,
        userId,
      })
    ),
    onSuccess: async (_response, draftId) => {
      await invalidateConsoleData(queryClient, [
        queryKeys.drafts('all'),
        queryKeys.drafts(sessionId),
        queryKeys.draft(draftId, sessionId),
      ]);
    },
  });
}

export function useDraftPatchMutation() {
  const queryClient = useQueryClient();
  const { sessionId, userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: { draftId: string; body: Omit<WorkflowDraftSpecPatchRequest, 'schemaVersion' | 'sessionId' | 'userId'> }) => (
      await patchDraftSpec(input.draftId, {
        schemaVersion: 'v1',
        sessionId,
        userId,
        ...input.body,
      })
    ),
    onSuccess: async (_response, input) => {
      await invalidateConsoleData(queryClient, [
        queryKeys.drafts('all'),
        queryKeys.drafts(sessionId),
        queryKeys.draft(input.draftId, sessionId),
      ]);
    },
  });
}

export function useDraftPublishMutation() {
  const queryClient = useQueryClient();
  const { sessionId, userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: { draftId: string; body?: Partial<WorkflowDraftPublishRequest> }) => (
      await postDraftPublish(input.draftId, {
        schemaVersion: 'v1',
        sessionId: input.body?.sessionId || sessionId,
        userId: input.body?.userId || userId,
      })
    ),
    onSuccess: async (_response, input) => {
      await invalidateConsoleData(queryClient, [
        queryKeys.drafts('all'),
        queryKeys.drafts(sessionId),
        queryKeys.draft(input.draftId, sessionId),
        queryKeys.templates,
      ]);
    },
  });
}

export function useAgentsQuery() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: getAgents,
  });
}

export function useAgentQuery(agentId?: string) {
  return useQuery({
    queryKey: agentId ? queryKeys.agent(agentId) : ['agents', 'detail', 'empty'],
    queryFn: () => getAgent(String(agentId)),
    enabled: Boolean(agentId),
  });
}

export function useTriggerBindingsQuery(agentId?: string) {
  return useQuery({
    queryKey: agentId ? queryKeys.triggerBindings(agentId) : ['agents', 'trigger-bindings', 'empty'],
    queryFn: () => getTriggerBindings(String(agentId)),
    enabled: Boolean(agentId),
  });
}

export function useActionBindingsQuery(agentId?: string) {
  return useQuery({
    queryKey: agentId ? queryKeys.actionBindings(agentId) : ['agents', 'action-bindings', 'empty'],
    queryFn: () => getActionBindings(String(agentId)),
    enabled: Boolean(agentId),
  });
}

export function useActionBindingQuery(actionBindingId?: string) {
  return useQuery({
    queryKey: actionBindingId ? ['action-bindings', actionBindingId] : ['action-bindings', 'empty'],
    queryFn: () => getActionBinding(String(actionBindingId)),
    enabled: Boolean(actionBindingId),
  });
}

export function useCreateAgentMutation() {
  const queryClient = useQueryClient();
  const { userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: Omit<AgentDefinitionCreateRequest, 'schemaVersion' | 'createdBy'>) => (
      await postCreateAgent({
        schemaVersion: 'v1',
        createdBy: userId,
        ...input,
      })
    ),
    onSuccess: async (response) => {
      await invalidateConsoleData(queryClient, [queryKeys.agents, queryKeys.agent(response.agent.agentId)]);
    },
  });
}

function useAgentLifecycleMutation(
  action: (agentId: string, body: AgentDefinitionLifecycleRequest) => Promise<AgentDefinitionResponse>,
) {
  const queryClient = useQueryClient();
  const { userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: { agentId: string; summary?: string; justification?: string }) => (
      await action(input.agentId, {
        schemaVersion: 'v1',
        userId,
        summary: input.summary,
        justification: input.justification,
      })
    ),
    onSuccess: async (response) => {
      await invalidateConsoleData(queryClient, [
        queryKeys.agents,
        queryKeys.agent(response.agent.agentId),
        queryKeys.governanceRequests,
      ]);
    },
  });
}

export function useActivateAgentMutation() {
  return useAgentLifecycleMutation(postActivateAgent);
}

export function useSuspendAgentMutation() {
  return useAgentLifecycleMutation(postSuspendAgent);
}

export function useRetireAgentMutation() {
  return useAgentLifecycleMutation(postRetireAgent);
}

export function useStartAgentRunMutation() {
  const queryClient = useQueryClient();
  const { sessionId, userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: { agentId: string; body: Omit<AgentRunStartRequest, 'schemaVersion' | 'traceId' | 'sessionId' | 'userId'> }) => (
      await postStartAgentRun(input.agentId, {
        schemaVersion: 'v1',
        traceId: createTraceId(),
        sessionId,
        userId,
        ...input.body,
      })
    ),
    onSuccess: async () => {
      await invalidateConsoleData(queryClient, [queryKeys.runs, queryKeys.agents]);
    },
  });
}

export function useCreateTriggerBindingMutation() {
  const queryClient = useQueryClient();
  const { userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: { agentId: string; body: Omit<TriggerBindingCreateRequest, 'schemaVersion' | 'userId'> }) => (
      await postCreateTriggerBinding(input.agentId, {
        schemaVersion: 'v1',
        userId,
        ...input.body,
      })
    ),
    onSuccess: async (response) => {
      await invalidateConsoleData(queryClient, [
        queryKeys.triggerBindings(response.triggerBinding.agentId),
        queryKeys.governanceRequests,
      ]);
    },
  });
}

function useTriggerLifecycleMutation(
  action: (triggerBindingId: string, body: TriggerBindingLifecycleRequest) => Promise<TriggerBindingResponse>,
) {
  const queryClient = useQueryClient();
  const { userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: { triggerBindingId: string; agentId: string; summary?: string; justification?: string }) => (
      await action(input.triggerBindingId, {
        schemaVersion: 'v1',
        userId,
        summary: input.summary,
        justification: input.justification,
      })
    ),
    onSuccess: async (response) => {
      await invalidateConsoleData(queryClient, [
        queryKeys.triggerBindings(response.triggerBinding.agentId),
        queryKeys.governanceRequests,
      ]);
    },
  });
}

export function useEnableTriggerBindingMutation() {
  return useTriggerLifecycleMutation(postEnableTriggerBinding);
}

export function useDisableTriggerBindingMutation() {
  return useTriggerLifecycleMutation(postDisableTriggerBinding);
}

export function useCreateActionBindingMutation() {
  const queryClient = useQueryClient();
  const { userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: { agentId: string; body: Omit<ActionBindingCreateRequest, 'schemaVersion' | 'userId'> }) => (
      await postCreateActionBinding(input.agentId, {
        schemaVersion: 'v1',
        userId,
        ...input.body,
      })
    ),
    onSuccess: async (_response, input) => {
      await invalidateConsoleData(queryClient, [
        queryKeys.actionBindings(input.agentId),
        queryKeys.connectorBindings,
      ]);
    },
  });
}

export function useConnectorDefinitionsQuery() {
  return useQuery({
    queryKey: queryKeys.connectorDefinitions,
    queryFn: getConnectorDefinitions,
  });
}

export function useConnectorDefinitionQuery(connectorDefinitionId?: string) {
  return useQuery({
    queryKey: connectorDefinitionId
      ? queryKeys.connectorDefinition(connectorDefinitionId)
      : ['capabilities', 'connector-definitions', 'empty'],
    queryFn: () => getConnectorDefinition(String(connectorDefinitionId)),
    enabled: Boolean(connectorDefinitionId),
  });
}

export function useConnectorBindingsQuery() {
  return useQuery({
    queryKey: queryKeys.connectorBindings,
    queryFn: getConnectorBindings,
  });
}

export function useConnectorBindingQuery(connectorBindingId?: string) {
  return useQuery({
    queryKey: connectorBindingId
      ? queryKeys.connectorBinding(connectorBindingId)
      : ['capabilities', 'connector-bindings', 'empty'],
    queryFn: () => getConnectorBinding(String(connectorBindingId)),
    enabled: Boolean(connectorBindingId),
  });
}

export function useEventSubscriptionsQuery() {
  return useQuery({
    queryKey: queryKeys.eventSubscriptions,
    queryFn: getEventSubscriptions,
  });
}

export function useEventSubscriptionQuery(eventSubscriptionId?: string) {
  return useQuery({
    queryKey: eventSubscriptionId
      ? queryKeys.eventSubscription(eventSubscriptionId)
      : ['capabilities', 'event-subscriptions', 'empty'],
    queryFn: () => getEventSubscription(String(eventSubscriptionId)),
    enabled: Boolean(eventSubscriptionId),
  });
}

export function useBridgesQuery() {
  return useQuery({
    queryKey: queryKeys.bridges,
    queryFn: getBridges,
  });
}

export function useBridgeQuery(bridgeId?: string) {
  return useQuery({
    queryKey: bridgeId ? queryKeys.bridge(bridgeId) : ['capabilities', 'bridges', 'empty'],
    queryFn: () => getBridge(String(bridgeId)),
    enabled: Boolean(bridgeId),
  });
}

export function useCreateConnectorDefinitionMutation() {
  const queryClient = useQueryClient();
  const { userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: Omit<ConnectorDefinitionCreateRequest, 'schemaVersion' | 'userId'>) => (
      await postCreateConnectorDefinition({
        schemaVersion: 'v1',
        userId,
        ...input,
      })
    ),
    onSuccess: async (response) => {
      await invalidateConsoleData(queryClient, [
        queryKeys.connectorDefinitions,
        queryKeys.connectorDefinition(response.connectorDefinition.connectorDefinitionId),
      ]);
    },
  });
}

export function useCreateConnectorBindingMutation() {
  const queryClient = useQueryClient();
  const { userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: Omit<ConnectorBindingCreateRequest, 'schemaVersion' | 'userId'>) => (
      await postCreateConnectorBinding({
        schemaVersion: 'v1',
        userId,
        ...input,
      })
    ),
    onSuccess: async (response) => {
      await invalidateConsoleData(queryClient, [
        queryKeys.connectorBindings,
        queryKeys.connectorBinding(response.connectorBinding.connectorBindingId),
      ]);
    },
  });
}

export function useCreateEventSubscriptionMutation() {
  const queryClient = useQueryClient();
  const { userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: Omit<EventSubscriptionCreateRequest, 'schemaVersion' | 'userId'>) => (
      await postCreateEventSubscription({
        schemaVersion: 'v1',
        userId,
        ...input,
      })
    ),
    onSuccess: async (response) => {
      await invalidateConsoleData(queryClient, [
        queryKeys.eventSubscriptions,
        queryKeys.eventSubscription(response.eventSubscription.eventSubscriptionId),
      ]);
    },
  });
}

export function useCreateBridgeMutation() {
  const queryClient = useQueryClient();
  const { userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: Omit<BridgeRegistrationCreateRequest, 'schemaVersion' | 'userId'>) => (
      await postCreateBridge({
        schemaVersion: 'v1',
        userId,
        ...input,
      })
    ),
    onSuccess: async (response) => {
      await invalidateConsoleData(queryClient, [queryKeys.bridges, queryKeys.bridge(response.bridge.bridgeId)]);
    },
  });
}

function useBridgeLifecycleMutation(
  action: (bridgeId: string, body: BridgeRegistrationLifecycleRequest) => Promise<BridgeRegistrationResponse>,
) {
  const queryClient = useQueryClient();
  const { userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: { bridgeId: string; summary?: string; justification?: string }) => (
      await action(input.bridgeId, {
        schemaVersion: 'v1',
        userId,
        summary: input.summary,
        justification: input.justification,
      })
    ),
    onSuccess: async (response) => {
      await invalidateConsoleData(queryClient, [queryKeys.bridges, queryKeys.bridge(response.bridge.bridgeId)]);
    },
  });
}

export function useActivateBridgeMutation() {
  return useBridgeLifecycleMutation(postActivateBridge);
}

export function useSuspendBridgeMutation() {
  return useBridgeLifecycleMutation(postSuspendBridge);
}

export function usePolicyBindingsQuery() {
  return useQuery({
    queryKey: queryKeys.policyBindings,
    queryFn: getPolicyBindings,
  });
}

export function useSecretRefsQuery() {
  return useQuery({
    queryKey: queryKeys.secretRefs,
    queryFn: getSecretRefs,
  });
}

export function useScopeGrantsQuery() {
  return useQuery({
    queryKey: queryKeys.scopeGrants,
    queryFn: getScopeGrants,
  });
}

export function useGovernanceRequestsQuery() {
  return useQuery({
    queryKey: queryKeys.governanceRequests,
    queryFn: getGovernanceRequests,
  });
}

export function useGovernanceRequestQuery(requestId?: string) {
  return useQuery({
    queryKey: requestId ? queryKeys.governanceRequest(requestId) : ['governance', 'requests', 'empty'],
    queryFn: () => getGovernanceRequest(String(requestId)),
    enabled: Boolean(requestId),
  });
}

export function useCreatePolicyBindingMutation() {
  const queryClient = useQueryClient();
  const { userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: Omit<PolicyBindingCreateRequest, 'schemaVersion' | 'userId'>) => (
      await postCreatePolicyBinding({
        schemaVersion: 'v1',
        userId,
        ...input,
      })
    ),
    onSuccess: async () => {
      await invalidateConsoleData(queryClient, [queryKeys.policyBindings]);
    },
  });
}

export function useCreateSecretRefMutation() {
  const queryClient = useQueryClient();
  const { userId } = useActorIdentity();
  return useMutation({
    mutationFn: async (input: Omit<SecretRefCreateRequest, 'schemaVersion' | 'userId'>) => (
      await postCreateSecretRef({
        schemaVersion: 'v1',
        userId,
        ...input,
      })
    ),
    onSuccess: async () => {
      await invalidateConsoleData(queryClient, [queryKeys.secretRefs]);
    },
  });
}

export function useCreateGovernanceRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: GovernanceChangeRequestCreateRequest) => await postCreateGovernanceRequest(input),
    onSuccess: async (response) => {
      await invalidateConsoleData(queryClient, [
        queryKeys.governanceRequests,
        queryKeys.governanceRequest(response.request.requestId),
      ]);
    },
  });
}

function useGovernanceDecisionMutation(
  action: (requestId: string, body: GovernanceChangeDecisionRequest) => Promise<GovernanceChangeDecisionResponse>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; body: GovernanceChangeDecisionRequest }) => (
      await action(input.requestId, input.body)
    ),
    onSuccess: async (response) => {
      await invalidateConsoleData(queryClient, [
        queryKeys.governanceRequests,
        queryKeys.governanceRequest(response.request.requestId),
        queryKeys.agents,
        queryKeys.connectorBindings,
        queryKeys.policyBindings,
        queryKeys.scopeGrants,
      ]);
    },
  });
}

export function useApproveGovernanceRequestMutation() {
  return useGovernanceDecisionMutation(postApproveGovernanceRequest);
}

export function useRejectGovernanceRequestMutation() {
  return useGovernanceDecisionMutation(postRejectGovernanceRequest);
}
