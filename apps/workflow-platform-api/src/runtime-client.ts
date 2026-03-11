import { buildInternalAuthHeaders, type InternalAuthConfig } from '@baseinterface/shared';
import type {
  WorkflowArtifactDetailResponse,
  WorkflowCommandResponse,
  WorkflowRunQueryResponse,
  WorkflowRuntimeResumeRunRequest,
  WorkflowRuntimeStartRunRequest,
} from '@baseinterface/workflow-contracts';

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

  async getRun(runId: string): Promise<WorkflowRunQueryResponse> {
    return this.get(`/internal/runtime/runs/${encodeURIComponent(runId)}`, this.runtimeServiceId);
  }

  async listApprovals(): Promise<Record<string, unknown>> {
    return this.get('/internal/runtime/approvals', this.runtimeServiceId);
  }

  async getArtifact(artifactId: string): Promise<WorkflowArtifactDetailResponse> {
    return this.get(`/internal/runtime/artifacts/${encodeURIComponent(artifactId)}`, this.runtimeServiceId);
  }

  private async post<T>(path: string, body: unknown, audience: string): Promise<T> {
    const rawBody = JSON.stringify(body);
    const headers = buildInternalAuthHeaders(this.internalAuthConfig, {
      method: 'POST',
      path,
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
        throw new Error(`runtime responded ${response.status}`);
      }
      return await response.json() as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private async get<T>(path: string, audience: string): Promise<T> {
    const headers = buildInternalAuthHeaders(this.internalAuthConfig, {
      method: 'GET',
      path,
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
        throw new Error(`runtime responded ${response.status}`);
      }
      return await response.json() as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
