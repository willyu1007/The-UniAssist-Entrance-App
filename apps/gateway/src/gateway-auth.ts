import crypto from 'node:crypto';
import type { Response } from 'express';

import {
  verifyInternalAuthRequest,
  type InternalAuthConfig,
  type InternalAuthDenyCode,
  type NonceStore,
} from '@baseinterface/shared';

import type { RawBodyRequest } from './gateway-types';

type LoggerLike = {
  warn: (msg: string, fields?: Record<string, unknown>) => void;
};

type ObservabilityLike = {
  observeInternalAuthRequest: (
    endpoint: string,
    mode: 'off' | 'audit' | 'enforce',
    outcome: 'pass' | 'audit_allow' | 'deny',
  ) => void;
  observeInternalAuthDenied: (endpoint: string, code: InternalAuthDenyCode) => void;
  observeInternalAuthReplay: (endpoint: string) => void;
};

type AuthDeps = {
  internalAuthConfig: InternalAuthConfig;
  internalNonceStore: NonceStore;
  nonceReplay: Map<string, number>;
  adapterSecret: string;
  now: () => number;
  observability: ObservabilityLike;
  logger: LoggerLike;
};

export type InternalAuthGuardOptions = {
  endpoint: string;
  expectedAudience: string;
  requiredScopes?: string[];
  allowedSubjects?: string[];
  traceId?: string;
};

export type AuthGuards = {
  guardInternalAuth: (
    req: RawBodyRequest,
    res: Response,
    options: InternalAuthGuardOptions,
  ) => Promise<boolean>;
  requireExternalSignature: (req: RawBodyRequest) => { ok: true } | { ok: false; message: string };
};

function buildAuthProblemDetail(
  code: InternalAuthDenyCode,
  status: 401 | 403,
  message: string,
): {
  type: string;
  title: string;
  status: 401 | 403;
  code: InternalAuthDenyCode;
  detail: string;
} {
  return {
    type: status === 403 ? 'https://uniassist/errors/forbidden' : 'https://uniassist/errors/unauthorized',
    title: status === 403 ? 'Forbidden' : 'Unauthorized',
    status,
    code,
    detail: message,
  };
}

function resolveTraceIdFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const obj = body as Record<string, unknown>;
  if (typeof obj.traceId === 'string') return obj.traceId;
  const input = obj.input as Record<string, unknown> | undefined;
  if (input && typeof input.traceId === 'string') return input.traceId;
  const interaction = obj.interaction as Record<string, unknown> | undefined;
  if (interaction && typeof interaction.traceId === 'string') return interaction.traceId;
  return undefined;
}

export function createAuthGuards(deps: AuthDeps): AuthGuards {
  const guardInternalAuth: AuthGuards['guardInternalAuth'] = async (req, res, options) => {
    if (deps.internalAuthConfig.mode === 'off') {
      deps.observability.observeInternalAuthRequest(options.endpoint, 'off', 'pass');
      return true;
    }

    const verification = await verifyInternalAuthRequest({
      method: req.method,
      path: req.path,
      rawBody: req.rawBody || '',
      headers: req.headers as Record<string, string | string[] | undefined>,
      config: deps.internalAuthConfig,
      nonceStore: deps.internalNonceStore,
      expectedAudience: options.expectedAudience,
      requiredScopes: options.requiredScopes,
      allowedSubjects: options.allowedSubjects,
    });

    if (verification.ok) {
      deps.observability.observeInternalAuthRequest(options.endpoint, deps.internalAuthConfig.mode, 'pass');
      return true;
    }

    deps.observability.observeInternalAuthDenied(options.endpoint, verification.code);
    if (verification.code === 'AUTH_REPLAY') {
      deps.observability.observeInternalAuthReplay(options.endpoint);
    }

    const effectiveTraceId = options.traceId || resolveTraceIdFromBody(req.body);
    const deniedFields: Record<string, unknown> = {
      endpoint: options.endpoint,
      mode: deps.internalAuthConfig.mode,
      code: verification.code,
      detail: verification.message,
      traceId: effectiveTraceId,
      requiredScopes: options.requiredScopes,
      subject: verification.claims?.sub,
      audience: verification.claims?.aud,
    };
    deps.logger.warn('internal auth denied', deniedFields);

    if (deps.internalAuthConfig.mode === 'audit') {
      deps.observability.observeInternalAuthRequest(options.endpoint, 'audit', 'audit_allow');
      return true;
    }

    deps.observability.observeInternalAuthRequest(options.endpoint, 'enforce', 'deny');
    const problem = buildAuthProblemDetail(verification.code, verification.status, verification.message);
    res.status(problem.status).json({
      schemaVersion: 'v0',
      ...problem,
      traceId: effectiveTraceId,
    });
    return false;
  };

  const requireExternalSignature: AuthGuards['requireExternalSignature'] = (req) => {
    const signature = req.header('x-uniassist-signature');
    const ts = req.header('x-uniassist-timestamp');
    const nonce = req.header('x-uniassist-nonce');

    if (!signature || !ts || !nonce) {
      return { ok: false, message: 'missing signature headers' };
    }

    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) {
      return { ok: false, message: 'invalid timestamp' };
    }

    const drift = Math.abs(deps.now() - tsNum);
    if (drift > 5 * 60 * 1000) {
      return { ok: false, message: 'timestamp expired' };
    }

    const usedAt = deps.nonceReplay.get(nonce);
    if (usedAt && deps.now() - usedAt < 5 * 60 * 1000) {
      return { ok: false, message: 'nonce replayed' };
    }

    const raw = req.rawBody || '';
    const expected = crypto
      .createHmac('sha256', deps.adapterSecret)
      .update(`${ts}.${nonce}.${raw}`)
      .digest('hex');

    const actualBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
      return { ok: false, message: 'invalid signature' };
    }

    deps.nonceReplay.set(nonce, deps.now());
    return { ok: true };
  };

  return {
    guardInternalAuth,
    requireExternalSignature,
  };
}
