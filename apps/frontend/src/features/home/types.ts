import type {
  InteractionEvent,
  TaskExecutionPolicy,
  TaskLifecycleState,
} from '@baseinterface/contracts';

export type ChatItem = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text?: string;
  sourceLabel?: string;
  providerId?: string;
  runId?: string;
  interaction?: InteractionEvent;
};

export type SwitchSuggestion = {
  actionId: string;
  providerId: string;
  runId?: string;
};

export type TaskThreadView = {
  taskId: string;
  providerId: string;
  runId: string;
  state: TaskLifecycleState;
  executionPolicy: TaskExecutionPolicy;
  questionId?: string;
  replyToken?: string;
  prompt?: string;
};

export type FocusedTaskResponse = {
  accepted?: boolean;
  newSessionId?: string;
  focusedTask?: {
    taskId: string;
    providerId: string;
    runId: string;
    replyToken?: string;
  };
};
