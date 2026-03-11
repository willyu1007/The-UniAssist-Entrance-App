import type {
  WorkflowDraftCreateRequest,
  WorkflowDraftDetailResponse,
  WorkflowDraftFocusRequest,
  WorkflowDraftFocusResponse,
  WorkflowDraftIntakeRequest,
  WorkflowDraftListResponse,
  WorkflowDraftMutateResponse,
  WorkflowDraftPublishRequest,
  WorkflowDraftPublishResponse,
} from '@baseinterface/workflow-contracts';

export const BUILDER_PROVIDER_ID = 'workflow_builder';
export const BUILDER_ENTRY_MODE = 'workflow_builder';

type BuilderClientDeps = {
  baseUrl: string;
};

function getErrorMessage(json: unknown, status: number): string {
  if (json && typeof json === 'object' && typeof (json as { error?: unknown }).error === 'string') {
    return (json as { error: string }).error;
  }
  return `builder api responded ${status}`;
}

export type BuilderClient = {
  createDraft: (input: WorkflowDraftCreateRequest) => Promise<WorkflowDraftMutateResponse>;
  listDrafts: (sessionId: string) => Promise<WorkflowDraftListResponse>;
  getDraft: (draftId: string, sessionId?: string) => Promise<WorkflowDraftDetailResponse>;
  focusDraft: (draftId: string, input: WorkflowDraftFocusRequest) => Promise<WorkflowDraftFocusResponse>;
  intakeDraft: (draftId: string, input: WorkflowDraftIntakeRequest) => Promise<WorkflowDraftMutateResponse>;
  synthesizeDraft: (draftId: string, input: WorkflowDraftFocusRequest) => Promise<WorkflowDraftMutateResponse>;
  validateDraft: (draftId: string, input: WorkflowDraftFocusRequest) => Promise<WorkflowDraftMutateResponse>;
  publishDraft: (draftId: string, input: WorkflowDraftPublishRequest) => Promise<WorkflowDraftPublishResponse>;
};

export function createBuilderClient(deps: BuilderClientDeps): BuilderClient {
  const baseUrl = deps.baseUrl.replace(/\/$/, '');

  const post = async <T>(path: string, body: unknown): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await response.json() as unknown;
    if (!response.ok) {
      throw new Error(getErrorMessage(json, response.status));
    }
    return json as T;
  };

  const get = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`);
    const json = await response.json() as unknown;
    if (!response.ok) {
      throw new Error(getErrorMessage(json, response.status));
    }
    return json as T;
  };

  return {
    createDraft: (input) => post('/v1/workflow-drafts', input),
    listDrafts: (sessionId) => get(`/v1/workflow-drafts?sessionId=${encodeURIComponent(sessionId)}`),
    getDraft: (draftId, sessionId) => get(`/v1/workflow-drafts/${encodeURIComponent(draftId)}${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`),
    focusDraft: (draftId, input) => post(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/focus`, input),
    intakeDraft: (draftId, input) => post(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/intake`, input),
    synthesizeDraft: (draftId, input) => post(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/synthesize`, input),
    validateDraft: (draftId, input) => post(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/validate`, input),
    publishDraft: (draftId, input) => post(`/v1/workflow-drafts/${encodeURIComponent(draftId)}/publish`, input),
  };
}
