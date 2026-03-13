import type {
  WorkflowCommandResponse,
} from '@baseinterface/workflow-contracts';
import type { WorkflowEntryRegistryEntry } from './gateway-types';

type LoggerLike = {
  warn: (msg: string, fields?: Record<string, unknown>) => void;
};

type WorkflowClientDeps = {
  enabled: boolean;
  baseUrl: string;
  entryRegistry: WorkflowEntryRegistryEntry[];
  logger: LoggerLike;
};

type StartWorkflowRunInput = {
  traceId: string;
  sessionId: string;
  userId: string;
  workflowKey: string;
  templateVersionId?: string;
  inputText?: string;
  inputPayload?: Record<string, unknown>;
};

type ResumeWorkflowRunInput = {
  traceId: string;
  sessionId: string;
  userId: string;
  runId: string;
  actionId: string;
  replyToken?: string;
  taskId?: string;
  payload?: Record<string, unknown>;
};

export type WorkflowClient = {
  isEnabled: () => boolean;
  matchWorkflowEntry: (text: string | undefined) => WorkflowEntryRegistryEntry | undefined;
  startWorkflowRun: (input: StartWorkflowRunInput) => Promise<WorkflowCommandResponse>;
  resumeWorkflowRun: (input: ResumeWorkflowRunInput) => Promise<WorkflowCommandResponse>;
};

function includesKeyword(text: string, keywords: string[]): boolean {
  const lowered = text.toLowerCase();
  return keywords.some((keyword) => lowered.includes(keyword.toLowerCase()));
}

export function createWorkflowClient(deps: WorkflowClientDeps): WorkflowClient {
  const registry = deps.entryRegistry.filter((entry) => entry.enabled);

  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${deps.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`workflow platform api responded ${response.status} for ${path}`);
    }
    return await response.json() as WorkflowCommandResponse;
  };

  return {
    isEnabled: () => deps.enabled,
    matchWorkflowEntry: (text: string | undefined) => {
      const normalized = (text || '').trim();
      if (!deps.enabled || !normalized) return undefined;
      return registry.find((entry) => includesKeyword(normalized, entry.matchKeywords));
    },
    startWorkflowRun: (input) => {
      return post('/v1/runs', {
        schemaVersion: 'v1',
        traceId: input.traceId,
        sessionId: input.sessionId,
        userId: input.userId,
        workflowKey: input.workflowKey,
        templateVersionId: input.templateVersionId,
        inputText: input.inputText,
        inputPayload: input.inputPayload,
      });
    },
    resumeWorkflowRun: (input) => {
      return post(`/v1/runs/${encodeURIComponent(input.runId)}/resume`, {
        schemaVersion: 'v1',
        traceId: input.traceId,
        sessionId: input.sessionId,
        userId: input.userId,
        actionId: input.actionId,
        replyToken: input.replyToken,
        taskId: input.taskId,
        payload: input.payload,
      });
    },
  };
}
