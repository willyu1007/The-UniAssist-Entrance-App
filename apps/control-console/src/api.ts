import type {
  WorkflowArtifactDetailResponse,
  WorkflowApprovalDecisionRequest,
  WorkflowApprovalDecisionResponse,
  WorkflowApprovalDetailResponse,
  WorkflowApprovalQueueResponse,
  WorkflowConsoleHeartbeatEnvelope,
  WorkflowConsoleStreamEnvelope,
  WorkflowDraftCreateRequest,
  WorkflowDraftDetailResponse,
  WorkflowDraftFocusRequest,
  WorkflowDraftFocusResponse,
  WorkflowDraftIntakeRequest,
  WorkflowDraftListResponse,
  WorkflowDraftMutateResponse,
  WorkflowDraftPublishRequest,
  WorkflowDraftPublishResponse,
  WorkflowDraftSpecPatchRequest,
  WorkflowDraftSpecPatchResponse,
  WorkflowRunListResponse,
  WorkflowRunQueryResponse,
} from '@baseinterface/workflow-contracts';
import { CONTROL_CONSOLE_API_BASE_URL } from './config';

export class ControlConsoleApiError extends Error {
  readonly statusCode: number;

  readonly errorCode?: string;

  constructor(message: string, statusCode: number, errorCode?: string) {
    super(message);
    this.name = 'ControlConsoleApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

type FetchOptions = RequestInit & {
  bodyJson?: unknown;
};

async function requestJson<T>(path: string, init: FetchOptions = {}): Promise<T> {
  const response = await fetch(`${CONTROL_CONSOLE_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
    body: init.bodyJson === undefined ? init.body : JSON.stringify(init.bodyJson),
  });

  const json = (await response.json().catch(() => undefined)) as {
    error?: string;
    code?: string;
  } | undefined;

  if (!response.ok) {
    throw new ControlConsoleApiError(
      json?.error || `request failed with status ${response.status}`,
      response.status,
      json?.code,
    );
  }

  return json as T;
}

export const queryKeys = {
  runs: ['runs'] as const,
  run: (runId: string) => ['runs', 'detail', runId] as const,
  approvals: ['approvals'] as const,
  approval: (approvalRequestId: string) => ['approvals', 'detail', approvalRequestId] as const,
  artifact: (artifactId: string) => ['artifacts', 'detail', artifactId] as const,
  drafts: (scope: 'all' | string) => ['drafts', scope] as const,
  draft: (draftId: string, scope: 'all' | string) => ['drafts', scope, 'detail', draftId] as const,
};

export function buildConsoleStreamUrl(): string {
  return `${CONTROL_CONSOLE_API_BASE_URL}/v1/control-console/stream`;
}

export function parseConsoleStreamEnvelope(raw: string): WorkflowConsoleStreamEnvelope | undefined {
  try {
    const parsed = JSON.parse(raw) as WorkflowConsoleStreamEnvelope | WorkflowConsoleHeartbeatEnvelope;
    if (parsed.schemaVersion !== 'v1') {
      return undefined;
    }
    if (parsed.type === 'control_console_event') {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function getRuns(limit = 30): Promise<WorkflowRunListResponse> {
  return await requestJson(`/v1/runs?limit=${encodeURIComponent(String(limit))}`, {
    method: 'GET',
  });
}

export async function getRun(runId: string): Promise<WorkflowRunQueryResponse> {
  return await requestJson(`/v1/runs/${encodeURIComponent(runId)}`, {
    method: 'GET',
  });
}

export async function getApprovalQueue(): Promise<WorkflowApprovalQueueResponse> {
  return await requestJson('/v1/approvals/queue', {
    method: 'GET',
  });
}

export async function getApprovalDetail(approvalRequestId: string): Promise<WorkflowApprovalDetailResponse> {
  return await requestJson(`/v1/approvals/${encodeURIComponent(approvalRequestId)}`, {
    method: 'GET',
  });
}

export async function getArtifact(artifactId: string): Promise<WorkflowArtifactDetailResponse> {
  return await requestJson(`/v1/artifacts/${encodeURIComponent(artifactId)}`, {
    method: 'GET',
  });
}

export async function postApprovalDecision(
  approvalRequestId: string,
  body: WorkflowApprovalDecisionRequest,
): Promise<WorkflowApprovalDecisionResponse> {
  return await requestJson(`/v1/approvals/${encodeURIComponent(approvalRequestId)}/decision`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function getDrafts(sessionId?: string): Promise<WorkflowDraftListResponse> {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  return await requestJson(`/v1/workflow-drafts${query}`, {
    method: 'GET',
  });
}

export async function getDraft(draftId: string, sessionId?: string): Promise<WorkflowDraftDetailResponse> {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  return await requestJson(`/v1/workflow-drafts/${encodeURIComponent(draftId)}${query}`, {
    method: 'GET',
  });
}

export async function postCreateDraft(body: WorkflowDraftCreateRequest): Promise<WorkflowDraftMutateResponse> {
  return await requestJson('/v1/workflow-drafts', {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postFocusDraft(
  draftId: string,
  body: WorkflowDraftFocusRequest,
): Promise<WorkflowDraftFocusResponse> {
  return await requestJson(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/focus`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postDraftIntake(
  draftId: string,
  body: WorkflowDraftIntakeRequest,
): Promise<WorkflowDraftMutateResponse> {
  return await requestJson(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/intake`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postDraftSynthesize(
  draftId: string,
  body: WorkflowDraftFocusRequest,
): Promise<WorkflowDraftMutateResponse> {
  return await requestJson(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/synthesize`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function postDraftValidate(
  draftId: string,
  body: WorkflowDraftFocusRequest,
): Promise<WorkflowDraftMutateResponse> {
  return await requestJson(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/validate`, {
    method: 'POST',
    bodyJson: body,
  });
}

export async function patchDraftSpec(
  draftId: string,
  body: WorkflowDraftSpecPatchRequest,
): Promise<WorkflowDraftSpecPatchResponse> {
  return await requestJson(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/spec`, {
    method: 'PATCH',
    bodyJson: body,
  });
}

export async function postDraftPublish(
  draftId: string,
  body: WorkflowDraftPublishRequest,
): Promise<WorkflowDraftPublishResponse> {
  return await requestJson(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/publish`, {
    method: 'POST',
    bodyJson: body,
  });
}
