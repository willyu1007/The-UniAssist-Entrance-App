import type { InteractionEvent, TaskExecutionPolicy } from '@baseinterface/contracts';

import type { GatewayObservability } from './observability';
import type { GatewayPersistence, TaskThreadRecord } from './persistence';
import type { SessionState, TaskThreadState } from './gateway-types';

type LoggerLike = {
  error: (msg: string, fields?: Record<string, unknown>) => void;
};

type TaskThreadDeps = {
  persistence: GatewayPersistence;
  observability: GatewayObservability;
  logger: LoggerLike;
  now: () => number;
  uuid: () => string;
  serializeError: (error: unknown) => Record<string, unknown>;
};

export type TaskThreadService = {
  ensureTaskThreadsLoaded: (sessionId: string) => Promise<void>;
  listPendingTaskThreads: (sessionId: string) => TaskThreadState[];
  findTaskThreadByReplyToken: (sessionId: string, replyToken: string) => TaskThreadState | undefined;
  getTaskMap: (sessionId: string) => Map<string, TaskThreadState>;
  updateTaskThread: (sessionId: string, thread: TaskThreadState) => TaskThreadState;
  normalizeProviderInteractionEvent: (providerId: string, runId: string, event: InteractionEvent) => InteractionEvent;
  buildTaskExecutionConfirmCard: (thread: TaskThreadState) => InteractionEvent;
  buildPendingTaskSelectionCard: (threads: TaskThreadState[]) => InteractionEvent;
};

export function createTaskThreadService(deps: TaskThreadDeps): TaskThreadService {
  const taskThreadsBySession = new Map<string, Map<string, TaskThreadState>>();

  const getTaskMap = (sessionId: string): Map<string, TaskThreadState> => {
    const existing = taskThreadsBySession.get(sessionId);
    if (existing) return existing;
    const created = new Map<string, TaskThreadState>();
    taskThreadsBySession.set(sessionId, created);
    return created;
  };

  const persistTaskThreadAsync = (thread: TaskThreadState): void => {
    if (!deps.persistence.isEnabled()) return;
    const record: TaskThreadRecord = {
      taskId: thread.taskId,
      sessionId: thread.sessionId,
      providerId: thread.providerId,
      runId: thread.runId,
      state: thread.state,
      executionPolicy: thread.executionPolicy,
      activeQuestionId: thread.activeQuestionId,
      activeReplyToken: thread.activeReplyToken,
      metadata: thread.metadata,
      updatedAt: thread.updatedAt,
    };
    void deps.persistence.saveTaskThread(record).catch((error: unknown) => {
      deps.observability.observePersistenceError();
      deps.logger.error('persistence saveTaskThread failed', deps.serializeError(error));
    });
  };

  const ensureTaskThreadsLoaded = async (sessionId: string): Promise<void> => {
    const existing = taskThreadsBySession.get(sessionId);
    if (existing || !deps.persistence.isEnabled()) return;
    try {
      const loaded = await deps.persistence.listTaskThreads(sessionId);
      const map = new Map<string, TaskThreadState>();
      loaded.forEach((thread) => {
        map.set(thread.taskId, {
          taskId: thread.taskId,
          sessionId: thread.sessionId,
          providerId: thread.providerId,
          runId: thread.runId,
          state: thread.state,
          executionPolicy: thread.executionPolicy,
          activeQuestionId: thread.activeQuestionId,
          activeReplyToken: thread.activeReplyToken,
          metadata: thread.metadata,
          updatedAt: thread.updatedAt || deps.now(),
        });
      });
      taskThreadsBySession.set(sessionId, map);
    } catch (error) {
      deps.observability.observePersistenceError();
      deps.logger.error('persistence listTaskThreads failed', deps.serializeError(error));
      taskThreadsBySession.set(sessionId, new Map<string, TaskThreadState>());
    }
  };

  const listPendingTaskThreads = (sessionId: string): TaskThreadState[] => {
    const map = taskThreadsBySession.get(sessionId);
    if (!map) return [];
    return [...map.values()].filter((thread) => thread.state === 'collecting' && thread.activeReplyToken);
  };

  const findTaskThreadByReplyToken = (sessionId: string, replyToken: string): TaskThreadState | undefined => {
    const map = taskThreadsBySession.get(sessionId);
    if (!map) return undefined;
    return [...map.values()].find((thread) => thread.activeReplyToken === replyToken);
  };

  const normalizeProviderInteractionEvent = (
    providerId: string,
    runId: string,
    event: InteractionEvent,
  ): InteractionEvent => {
    if (event.type !== 'provider_extension') {
      return event;
    }

    if (event.extensionKind === 'data_collection_request') {
      const taskId = event.payload.taskId || runId;
      return {
        type: 'provider_extension',
        extensionKind: 'task_question',
        payload: {
          schemaVersion: 'v0',
          providerId: event.payload.providerId || providerId,
          runId,
          taskId,
          questionId: `${taskId}:q:legacy`,
          replyToken: deps.uuid(),
          prompt: '请补充任务所需资料。',
          answerSchema: event.payload.dataSchema,
          uiSchema: event.payload.uiSchema,
          metadata: {
            legacyExtensionKind: 'data_collection_request',
            legacyStatus: event.payload.status,
          },
        },
      };
    }

    if (event.extensionKind === 'data_collection_progress') {
      return {
        type: 'provider_extension',
        extensionKind: 'task_state',
        payload: {
          schemaVersion: 'v0',
          providerId: event.payload.providerId || providerId,
          runId,
          taskId: event.payload.taskId || runId,
          state: 'collecting',
          executionPolicy: 'require_user_confirm',
          metadata: {
            legacyExtensionKind: 'data_collection_progress',
            progress: event.payload.progress,
            legacyStatus: event.payload.status,
          },
        },
      };
    }

    if (event.extensionKind === 'data_collection_result') {
      return {
        type: 'provider_extension',
        extensionKind: 'task_state',
        payload: {
          schemaVersion: 'v0',
          providerId: event.payload.providerId || providerId,
          runId,
          taskId: event.payload.taskId || runId,
          state: 'ready',
          executionPolicy: 'require_user_confirm',
          metadata: {
            legacyExtensionKind: 'data_collection_result',
            values: event.payload.values,
            dataSchema: event.payload.dataSchema,
            uiSchema: event.payload.uiSchema,
            legacyStatus: event.payload.status,
          },
        },
      };
    }

    if (event.extensionKind === 'task_question') {
      return {
        ...event,
        payload: {
          ...event.payload,
          providerId: event.payload.providerId || providerId,
          runId: event.payload.runId || runId,
        },
      };
    }

    if (event.extensionKind === 'task_state') {
      return {
        ...event,
        payload: {
          ...event.payload,
          providerId: event.payload.providerId || providerId,
          runId: event.payload.runId || runId,
        },
      };
    }

    return event;
  };

  const updateTaskThread = (sessionId: string, thread: TaskThreadState): TaskThreadState => {
    const map = getTaskMap(sessionId);
    const normalized: TaskThreadState = {
      ...thread,
      updatedAt: deps.now(),
    };
    map.set(normalized.taskId, normalized);
    persistTaskThreadAsync(normalized);
    return normalized;
  };

  const buildTaskExecutionConfirmCard = (thread: TaskThreadState): InteractionEvent => {
    return {
      type: 'card',
      title: `任务已准备就绪（${thread.providerId}）`,
      body: `任务 ${thread.taskId} 已满足执行条件，是否开始执行？`,
      actions: [
        {
          actionId: `execute_task:${thread.taskId}`,
          label: '开始执行',
          style: 'primary',
        },
      ],
    };
  };

  const buildPendingTaskSelectionCard = (threads: TaskThreadState[]): InteractionEvent => {
    return {
      type: 'card',
      title: '检测到多个待回复任务',
      body: '请先选择你要继续的任务，避免消息分配错误。',
      actions: threads.map((thread) => ({
        actionId: `focus_task:${thread.taskId}`,
        label: `${thread.providerId} · ${thread.taskId}`,
        style: 'secondary',
        payload: {
          taskId: thread.taskId,
          providerId: thread.providerId,
          runId: thread.runId,
        },
      })),
    };
  };

  return {
    ensureTaskThreadsLoaded,
    listPendingTaskThreads,
    findTaskThreadByReplyToken,
    getTaskMap,
    updateTaskThread,
    normalizeProviderInteractionEvent,
    buildTaskExecutionConfirmCard,
    buildPendingTaskSelectionCard,
  };
}

export function isTaskReadyForAutoExecute(executionPolicy: TaskExecutionPolicy): boolean {
  return executionPolicy === 'auto_execute';
}

export function buildFreshSessionState(session: SessionState): SessionState {
  return {
    ...session,
    topicDriftStreak: 0,
    switchLeadStreak: 0,
  };
}
