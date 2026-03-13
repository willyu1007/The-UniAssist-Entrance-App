import { buildInternalAuthHeaders, type InternalAuthConfig } from '@baseinterface/shared';
import type {
  WorkflowRuntimeCancelRunRequest,
  WorkflowApprovalDecisionRequest,
  WorkflowApprovalDecisionResponse,
  WorkflowApprovalDetailResponse,
  WorkflowApprovalQueueResponse,
  WorkflowArtifactDetailResponse,
  WorkflowCommandResponse,
  WorkflowInteractionRequestRecord,
  WorkflowRunListResponse,
  WorkflowRunQueryResponse,
  WorkflowRuntimeResumeRunRequest,
  WorkflowRuntimeStartRunRequest,
} from '@baseinterface/workflow-contracts';
import { PlatformError } from './platform-errors';

type RuntimeInteractionLookupResponse = {
  schemaVersion: 'v1';
  runId: string;
  interactionRequest: WorkflowInteractionRequestRecord;
};

type RuntimeClientDeps = {
  baseUrl: string;
  internalAuthConfig: InternalAuthConfig;
  runtimeServiceId: string;
  timeoutMs?: number;
};

export class RuntimeClient {
  private readonly baseUrl: string;

  private readonly internalAuthConfig: InternalAuthConfig;

  private readonly runtimeServiceId: string;

  private readonly timeoutMs: number;

  constructor(deps: RuntimeClientDeps) {
    this.baseUrl = deps.baseUrl.replace(/\/$/, '');
    this.internalAuthConfig = deps.internalAuthConfig;
    this.runtimeServiceId = deps.runtimeServiceId;
    this.timeoutMs = deps.timeoutMs ?? 5000;
  }

  async startRun(body: WorkflowRuntimeStartRunRequest): Promise<WorkflowCommandResponse> {
    return this.post('/internal/runtime/start-run', body, this.runtimeServiceId);
  }

  async resumeRun(body: WorkflowRuntimeResumeRunRequest): Promise<WorkflowCommandResponse> {
    return this.post('/internal/runtime/resume-run', body, this.runtimeServiceId);
  }

  async cancelRun(body: WorkflowRuntimeCancelRunRequest): Promise<WorkflowCommandResponse> {
    return this.post('/internal/runtime/cancel-run', body, this.runtimeServiceId);
  }

  async getRun(runId: string): Promise<WorkflowRunQueryResponse> {
    return this.get(`/internal/runtime/runs/${encodeURIComponent(runId)}`, this.runtimeServiceId);
  }

  async getInteractionRequest(interactionRequestId: string): Promise<RuntimeInteractionLookupResponse> {
    return this.get(`/internal/runtime/interactions/${encodeURIComponent(interactionRequestId)}`, this.runtimeServiceId);
  }

  async listRuns(limit = 25): Promise<WorkflowRunListResponse> {
    return this.get(`/internal/runtime/runs?limit=${encodeURIComponent(String(limit))}`, this.runtimeServiceId);
  }

  async listApprovals(): Promise<Record<string, unknown>> {
    return this.get('/internal/runtime/approvals', this.runtimeServiceId);
  }

  async listApprovalQueue(): Promise<WorkflowApprovalQueueResponse> {
    return this.get('/internal/runtime/approvals/queue', this.runtimeServiceId);
  }

  async getApprovalDetail(approvalRequestId: string): Promise<WorkflowApprovalDetailResponse> {
    return this.get(`/internal/runtime/approvals/${encodeURIComponent(approvalRequestId)}`, this.runtimeServiceId);
  }

  async decideApproval(
    approvalRequestId: string,
    body: WorkflowApprovalDecisionRequest,
  ): Promise<WorkflowApprovalDecisionResponse> {
    return this.post(`/internal/runtime/approvals/${encodeURIComponent(approvalRequestId)}/decision`, body, this.runtimeServiceId);
  }

  async getArtifact(artifactId: string): Promise<WorkflowArtifactDetailResponse> {
    return this.get(`/internal/runtime/artifacts/${encodeURIComponent(artifactId)}`, this.runtimeServiceId);
  }

  private getSignablePath(path: string): string {
    return path.split('?')[0] || path;
  }

  private async parseRuntimeError(response: Response): Promise<PlatformError> {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json().catch(() => undefined) as {
        error?: string;
        code?: string;
      } | undefined;
      return new PlatformError(
        response.status,
        json?.code || 'RUNTIME_REQUEST_FAILED',
        json?.error || `runtime responded ${response.status}`,
      );
    }

    const text = await response.text().catch(() => '');
    return new PlatformError(
      response.status,
      'RUNTIME_REQUEST_FAILED',
      text || `runtime responded ${response.status}`,
    );
  }

  private async post<T>(path: string, body: unknown, audience: string): Promise<T> {
    const rawBody = JSON.stringify(body);
    const headers = buildInternalAuthHeaders(this.internalAuthConfig, {
      method: 'POST',
      path: this.getSignablePath(path),
      rawBody,
      audience,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: headers.authorization,
          'x-uniassist-internal-kid': headers['x-uniassist-internal-kid'],
          'x-uniassist-internal-ts': headers['x-uniassist-internal-ts'],
          'x-uniassist-internal-nonce': headers['x-uniassist-internal-nonce'],
          'x-uniassist-internal-signature': headers['x-uniassist-internal-signature'],
        },
        body: rawBody,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw await this.parseRuntimeError(response);
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof PlatformError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PlatformError(504, 'RUNTIME_TIMEOUT', 'runtime request timed out');
      }
      throw new PlatformError(
        502,
        'RUNTIME_UNAVAILABLE',
        error instanceof Error ? error.message : 'runtime request failed',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async get<T>(path: string, audience: string): Promise<T> {
    const headers = buildInternalAuthHeaders(this.internalAuthConfig, {
      method: 'GET',
      path: this.getSignablePath(path),
      audience,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: {
          authorization: headers.authorization,
          'x-uniassist-internal-kid': headers['x-uniassist-internal-kid'],
          'x-uniassist-internal-ts': headers['x-uniassist-internal-ts'],
          'x-uniassist-internal-nonce': headers['x-uniassist-internal-nonce'],
          'x-uniassist-internal-signature': headers['x-uniassist-internal-signature'],
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw await this.parseRuntimeError(response);
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof PlatformError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PlatformError(504, 'RUNTIME_TIMEOUT', 'runtime request timed out');
      }
      throw new PlatformError(
        502,
        'RUNTIME_UNAVAILABLE',
        error instanceof Error ? error.message : 'runtime request failed',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
