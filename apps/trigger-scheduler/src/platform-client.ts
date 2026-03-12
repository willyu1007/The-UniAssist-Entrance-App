import { buildInternalAuthHeaders, type InternalAuthConfig } from '@baseinterface/shared';
import type {
  DueScheduleTriggerListResponse,
  TriggerDispatchRequest,
  TriggerDispatchResponse,
  WebhookTriggerRuntimeConfigResponse,
} from '@baseinterface/workflow-contracts';

export class PlatformClientError extends Error {
  readonly code: string;

  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'PlatformClientError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

type PlatformClientDeps = {
  baseUrl: string;
  internalAuthConfig: InternalAuthConfig;
  platformServiceId: string;
  timeoutMs?: number;
};

export class PlatformClient {
  private readonly baseUrl: string;

  private readonly internalAuthConfig: InternalAuthConfig;

  private readonly platformServiceId: string;

  private readonly timeoutMs: number;

  constructor(deps: PlatformClientDeps) {
    this.baseUrl = deps.baseUrl.replace(/\/$/, '');
    this.internalAuthConfig = deps.internalAuthConfig;
    this.platformServiceId = deps.platformServiceId;
    this.timeoutMs = deps.timeoutMs ?? 5000;
  }

  async listDueScheduleTriggers(timestampMs: number): Promise<DueScheduleTriggerListResponse> {
    return await this.get(`/internal/trigger-bindings/due?timestampMs=${encodeURIComponent(String(timestampMs))}`);
  }

  async getWebhookTriggerRuntimeConfig(publicTriggerKey: string): Promise<WebhookTriggerRuntimeConfigResponse> {
    return await this.get(`/internal/webhook-triggers/${encodeURIComponent(publicTriggerKey)}/runtime-config`);
  }

  async dispatchScheduleTrigger(
    triggerBindingId: string,
    body: TriggerDispatchRequest,
  ): Promise<TriggerDispatchResponse> {
    return await this.post(`/internal/trigger-bindings/${encodeURIComponent(triggerBindingId)}/dispatch`, body);
  }

  async dispatchWebhookTrigger(
    publicTriggerKey: string,
    body: TriggerDispatchRequest,
  ): Promise<TriggerDispatchResponse> {
    return await this.post(`/internal/webhook-triggers/${encodeURIComponent(publicTriggerKey)}/dispatch`, body);
  }

  private getSignablePath(path: string): string {
    return path.split('?')[0] || path;
  }

  private async parsePlatformError(response: Response): Promise<PlatformClientError> {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json().catch(() => undefined) as {
        error?: string;
        code?: string;
      } | undefined;
      return new PlatformClientError(
        response.status,
        json?.code || 'PLATFORM_REQUEST_FAILED',
        json?.error || `platform responded ${response.status}`,
      );
    }

    const text = await response.text().catch(() => '');
    return new PlatformClientError(
      response.status,
      'PLATFORM_REQUEST_FAILED',
      text || `platform responded ${response.status}`,
    );
  }

  private async get<T>(path: string): Promise<T> {
    const headers = buildInternalAuthHeaders(this.internalAuthConfig, {
      method: 'GET',
      path: this.getSignablePath(path),
      audience: this.platformServiceId,
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
        throw await this.parsePlatformError(response);
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof PlatformClientError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PlatformClientError(504, 'PLATFORM_TIMEOUT', 'platform request timed out');
      }
      throw new PlatformClientError(
        502,
        'PLATFORM_UNAVAILABLE',
        error instanceof Error ? error.message : 'platform request failed',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const rawBody = JSON.stringify(body);
    const headers = buildInternalAuthHeaders(this.internalAuthConfig, {
      method: 'POST',
      path: this.getSignablePath(path),
      rawBody,
      audience: this.platformServiceId,
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
        throw await this.parsePlatformError(response);
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof PlatformClientError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PlatformClientError(504, 'PLATFORM_TIMEOUT', 'platform request timed out');
      }
      throw new PlatformClientError(
        502,
        'PLATFORM_UNAVAILABLE',
        error instanceof Error ? error.message : 'platform request failed',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
