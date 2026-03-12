import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  WorkflowDraftCreateRequest,
  WorkflowDraftFocusRequest,
  WorkflowDraftIntakeRequest,
  WorkflowDraftPublishRequest,
  WorkflowDraftSpecPatchRequest,
} from '@baseinterface/workflow-contracts';
import {
  buildConsoleStreamUrl,
  getApprovalDetail,
  getApprovalQueue,
  getDraft,
  getDrafts,
  getRun,
  getRuns,
  parseConsoleStreamEnvelope,
  patchDraftSpec,
  postApprovalDecision,
  postCreateDraft,
  postDraftIntake,
  postDraftPublish,
  postDraftSynthesize,
  postDraftValidate,
  postFocusDraft,
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
  }
}

function defaultEventSourceFactory(url: string): EventSourceLike {
  return new EventSource(url);
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
    queryFn: () => getApprovalQueue(),
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

export function useApprovalDecisionMutation() {
  const queryClient = useQueryClient();
  const { identity } = useControlConsoleEnvironment();
  return useMutation({
    mutationFn: async (input: { approvalRequestId: string; decision: 'approved' | 'rejected'; comment?: string }) => (
      await postApprovalDecision(input.approvalRequestId, {
        schemaVersion: 'v1',
        traceId: createTraceId(),
        userId: identity.userId,
        decision: input.decision,
        comment: input.comment,
      })
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.approvals });
      await queryClient.invalidateQueries({ queryKey: queryKeys.runs });
    },
  });
}

export function useCreateDraftMutation() {
  const queryClient = useQueryClient();
  const { identity } = useControlConsoleEnvironment();
  return useMutation({
    mutationFn: async (input: Omit<WorkflowDraftCreateRequest, 'schemaVersion' | 'sessionId' | 'userId'>) => (
      await postCreateDraft({
        schemaVersion: 'v1',
        sessionId: identity.sessionId,
        userId: identity.userId,
        ...input,
      })
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
  });
}

export function useFocusDraftMutation() {
  const queryClient = useQueryClient();
  const { identity } = useControlConsoleEnvironment();
  return useMutation({
    mutationFn: async (input: { draftId: string; body?: Partial<WorkflowDraftFocusRequest> }) => (
      await postFocusDraft(input.draftId, {
        schemaVersion: 'v1',
        sessionId: input.body?.sessionId || identity.sessionId,
        userId: input.body?.userId || identity.userId,
      })
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
  });
}

export function useDraftIntakeMutation() {
  const queryClient = useQueryClient();
  const { identity } = useControlConsoleEnvironment();
  return useMutation({
    mutationFn: async (input: { draftId: string; text: string }) => (
      await postDraftIntake(input.draftId, {
        schemaVersion: 'v1',
        sessionId: identity.sessionId,
        userId: identity.userId,
        text: input.text,
      })
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
  });
}

export function useDraftSynthesizeMutation() {
  const queryClient = useQueryClient();
  const { identity } = useControlConsoleEnvironment();
  return useMutation({
    mutationFn: async (draftId: string) => (
      await postDraftSynthesize(draftId, {
        schemaVersion: 'v1',
        sessionId: identity.sessionId,
        userId: identity.userId,
      })
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
  });
}

export function useDraftValidateMutation() {
  const queryClient = useQueryClient();
  const { identity } = useControlConsoleEnvironment();
  return useMutation({
    mutationFn: async (draftId: string) => (
      await postDraftValidate(draftId, {
        schemaVersion: 'v1',
        sessionId: identity.sessionId,
        userId: identity.userId,
      })
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
  });
}

export function useDraftPatchMutation() {
  const queryClient = useQueryClient();
  const { identity } = useControlConsoleEnvironment();
  return useMutation({
    mutationFn: async (input: { draftId: string; body: Omit<WorkflowDraftSpecPatchRequest, 'schemaVersion' | 'sessionId' | 'userId'> }) => (
      await patchDraftSpec(input.draftId, {
        schemaVersion: 'v1',
        sessionId: identity.sessionId,
        userId: identity.userId,
        ...input.body,
      })
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
  });
}

export function useDraftPublishMutation() {
  const queryClient = useQueryClient();
  const { identity } = useControlConsoleEnvironment();
  return useMutation({
    mutationFn: async (input: { draftId: string; body?: Partial<WorkflowDraftPublishRequest> }) => (
      await postDraftPublish(input.draftId, {
        schemaVersion: 'v1',
        sessionId: input.body?.sessionId || identity.sessionId,
        userId: input.body?.userId || identity.userId,
      })
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
  });
}
