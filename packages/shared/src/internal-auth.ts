import crypto from 'node:crypto';

export type InternalAuthMode = 'off' | 'audit' | 'enforce';

export type InternalReplayBackend = 'memory' | 'redis';

export type InternalAuthDenyCode =
  | 'AUTH_MISSING'
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_SIGNATURE_INVALID'
  | 'AUTH_REPLAY'
  | 'AUTH_SCOPE_MISSING'
  | 'AUTH_AUD_MISMATCH';

export type InternalAuthVerificationResult =
  | {
      ok: true;
      claims: InternalJwtClaims;
      kid: string;
    }
  | {
      ok: false;
      code: InternalAuthDenyCode;
      message: string;
      status: 401 | 403;
      claims?: InternalJwtClaims;
    };

export type InternalAuthHeaders = {
  authorization: string;
  'x-uniassist-internal-kid': string;
  'x-uniassist-internal-ts': string;
  'x-uniassist-internal-nonce': string;
  'x-uniassist-internal-signature': string;
};

export type InternalJwtClaims = {
  iss: string;
  sub: string;
  aud: string;
  scope: string;
  iat: number;
  exp: number;
  jti: string;
};

export type InternalAuthConfig = {
  mode: InternalAuthMode;
  serviceId: string;
  issuer: string;
  signingKid: string;
  keys: Record<string, string>;
  tokenTtlSec: number;
  clockSkewSec: number;
  nonceTtlSec: number;
  replayBackend: InternalReplayBackend;
};

export type BuildInternalAuthHeadersInput = {
  method: string;
  path: string;
  rawBody?: string;
  audience: string;
  subject?: string;
  scopes?: string[];
  timestampMs?: number;
  nonce?: string;
  jti?: string;
};

export type VerifyInternalAuthRequestInput = {
  method: string;
  path: string;
  rawBody?: string;
  headers: Record<string, string | string[] | undefined>;
  config: InternalAuthConfig;
  nonceStore: NonceStore;
  expectedAudience: string;
  requiredScopes?: string[];
  allowedSubjects?: string[];
  nowMs?: number;
};

export type NonceStore = {
  setIfAbsent: (nonce: string, ttlMs: number) => boolean | Promise<boolean>;
};

type JwtHeader = {
  alg: 'HS256';
  typ: 'JWT';
  kid: string;
};

function clampInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function normalizeMode(value: string | undefined): InternalAuthMode {
  if (!value) return 'off';
  if (value === 'off' || value === 'audit' || value === 'enforce') {
    return value;
  }
  return 'off';
}

function normalizeReplayBackend(value: string | undefined, hasRedisUrl: boolean): InternalReplayBackend {
  if (value === 'redis' || value === 'memory') return value;
  return hasRedisUrl ? 'redis' : 'memory';
}

export function loadInternalAuthConfigFromEnv(env: NodeJS.ProcessEnv): InternalAuthConfig {
  const mode = normalizeMode(env.UNIASSIST_INTERNAL_AUTH_MODE);
  const serviceId = (env.UNIASSIST_SERVICE_ID || 'unknown').trim() || 'unknown';
  const issuer = (env.UNIASSIST_INTERNAL_AUTH_ISSUER || 'uniassist-internal').trim() || 'uniassist-internal';

  let keys: Record<string, string> = {};
  const rawKeys = env.UNIASSIST_INTERNAL_AUTH_KEYS_JSON?.trim();
  if (rawKeys) {
    try {
      const parsed = JSON.parse(rawKeys) as Record<string, unknown>;
      keys = Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] => {
          const [kid, value] = entry;
          return typeof kid === 'string' && kid.trim().length > 0 && typeof value === 'string' && value.length > 0;
        }),
      );
    } catch {
      keys = {};
    }
  }

  if (Object.keys(keys).length === 0) {
    keys = { 'dev-internal': 'dev-internal-secret' };
  }

  const fallbackKid = Object.keys(keys)[0] || 'dev-internal';
  const signingKid = (env.UNIASSIST_INTERNAL_AUTH_SIGNING_KID || fallbackKid).trim() || fallbackKid;

  if (!keys[signingKid]) {
    keys[signingKid] = keys[fallbackKid] || 'dev-internal-secret';
  }

  const tokenTtlSec = clampInt(env.UNIASSIST_INTERNAL_AUTH_TOKEN_TTL_S, 300);
  const clockSkewSec = clampInt(env.UNIASSIST_INTERNAL_AUTH_CLOCK_SKEW_S, 120);
  const nonceTtlSec = clampInt(env.UNIASSIST_INTERNAL_AUTH_NONCE_TTL_S, 300);
  const replayBackend = normalizeReplayBackend(
    env.UNIASSIST_INTERNAL_AUTH_REPLAY_BACKEND,
    Boolean(env.REDIS_URL),
  );

  return {
    mode,
    serviceId,
    issuer,
    signingKid,
    keys,
    tokenTtlSec,
    clockSkewSec,
    nonceTtlSec,
    replayBackend,
  };
}

function base64urlEncodeBytes(input: Buffer): string {
  return input.toString('base64url');
}

function base64urlEncodeJson(input: Record<string, unknown>): string {
  return base64urlEncodeBytes(Buffer.from(JSON.stringify(input), 'utf8'));
}

function base64urlDecodeJson<T>(input: string): T | null {
  try {
    const decoded = Buffer.from(input, 'base64url').toString('utf8');
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

function hmacHex(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function sha256Hex(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function timingSafeEqualHex(actual: string, expected: string): boolean {
  const a = Buffer.from(actual, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const trimmed = authorization.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
}

function parseScope(scopeText: string | undefined): string[] {
  if (!scopeText) return [];
  return scopeText
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readSingleHeader(
  headers: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'string') return value;
  return undefined;
}

function buildSignaturePayload(
  ts: string,
  nonce: string,
  method: string,
  path: string,
  rawBody: string,
): string {
  const bodyHash = sha256Hex(rawBody);
  return `${ts}.${nonce}.${method.toUpperCase()}.${path}.${bodyHash}`;
}

function signJwtToken(
  header: JwtHeader,
  claims: InternalJwtClaims,
  secret: string,
): string {
  const headerEncoded = base64urlEncodeJson(header as unknown as Record<string, unknown>);
  const payloadEncoded = base64urlEncodeJson(claims as unknown as Record<string, unknown>);
  const unsigned = `${headerEncoded}.${payloadEncoded}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(unsigned)
    .digest('base64url');
  return `${unsigned}.${signature}`;
}

function verifyJwtToken(
  token: string,
  config: InternalAuthConfig,
  expectedAudience: string,
  nowSec: number,
): {
  ok: true;
  claims: InternalJwtClaims;
  kid: string;
  secret: string;
} | {
  ok: false;
  code: InternalAuthDenyCode;
  message: string;
  status: 401;
} {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, code: 'AUTH_TOKEN_INVALID', message: 'jwt format is invalid', status: 401 };
  }

  const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
  if (!headerEncoded || !payloadEncoded || !signatureEncoded) {
    return { ok: false, code: 'AUTH_TOKEN_INVALID', message: 'jwt segment missing', status: 401 };
  }

  const header = base64urlDecodeJson<JwtHeader>(headerEncoded);
  const claims = base64urlDecodeJson<InternalJwtClaims>(payloadEncoded);
  if (!header || !claims) {
    return { ok: false, code: 'AUTH_TOKEN_INVALID', message: 'jwt decode failed', status: 401 };
  }

  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    return { ok: false, code: 'AUTH_TOKEN_INVALID', message: 'jwt algorithm is invalid', status: 401 };
  }

  const secret = config.keys[header.kid];
  if (!secret) {
    return { ok: false, code: 'AUTH_TOKEN_INVALID', message: 'jwt kid is unknown', status: 401 };
  }

  const unsigned = `${headerEncoded}.${payloadEncoded}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(unsigned)
    .digest('base64url');
  if (!timingSafeEqualHex(signatureEncoded, expectedSignature)) {
    return { ok: false, code: 'AUTH_TOKEN_INVALID', message: 'jwt signature invalid', status: 401 };
  }

  if (claims.iss !== config.issuer) {
    return { ok: false, code: 'AUTH_TOKEN_INVALID', message: 'jwt issuer mismatch', status: 401 };
  }

  if (claims.aud !== expectedAudience) {
    return { ok: false, code: 'AUTH_AUD_MISMATCH', message: 'jwt audience mismatch', status: 401 };
  }

  if (!claims.sub || !claims.jti) {
    return { ok: false, code: 'AUTH_TOKEN_INVALID', message: 'jwt missing required claims', status: 401 };
  }

  if (!Number.isFinite(claims.iat) || !Number.isFinite(claims.exp) || claims.exp <= claims.iat) {
    return { ok: false, code: 'AUTH_TOKEN_INVALID', message: 'jwt time claims invalid', status: 401 };
  }

  const minIat = nowSec - config.clockSkewSec;
  const maxExp = nowSec + config.clockSkewSec;
  if (claims.iat > maxExp) {
    return { ok: false, code: 'AUTH_TOKEN_INVALID', message: 'jwt not active yet', status: 401 };
  }
  if (claims.exp < minIat) {
    return { ok: false, code: 'AUTH_TOKEN_INVALID', message: 'jwt expired', status: 401 };
  }

  return { ok: true, claims, kid: header.kid, secret };
}

export function createMemoryNonceStore(): NonceStore {
  const memo = new Map<string, number>();
  return {
    setIfAbsent(nonce: string, ttlMs: number): boolean {
      const nowMs = Date.now();
      for (const [key, expiryAt] of memo.entries()) {
        if (expiryAt <= nowMs) {
          memo.delete(key);
        }
      }
      const existing = memo.get(nonce);
      if (existing && existing > nowMs) {
        return false;
      }
      memo.set(nonce, nowMs + Math.max(1, ttlMs));
      return true;
    },
  };
}

export function buildInternalAuthHeaders(
  config: InternalAuthConfig,
  input: BuildInternalAuthHeadersInput,
): InternalAuthHeaders {
  const tsMs = Math.floor(input.timestampMs ?? Date.now());
  const ts = String(tsMs);
  const nonce = input.nonce || crypto.randomUUID();
  const jti = input.jti || crypto.randomUUID();
  const kid = config.signingKid;
  const secret = config.keys[kid];
  if (!secret) {
    throw new Error(`missing signing key for kid=${kid}`);
  }

  const claims: InternalJwtClaims = {
    iss: config.issuer,
    sub: input.subject || config.serviceId,
    aud: input.audience,
    scope: (input.scopes || []).join(' ').trim(),
    iat: Math.floor(tsMs / 1000),
    exp: Math.floor(tsMs / 1000) + config.tokenTtlSec,
    jti,
  };

  const token = signJwtToken(
    {
      alg: 'HS256',
      typ: 'JWT',
      kid,
    },
    claims,
    secret,
  );

  const signaturePayload = buildSignaturePayload(
    ts,
    nonce,
    input.method,
    input.path,
    input.rawBody || '',
  );
  const signature = hmacHex(secret, signaturePayload);

  return {
    authorization: `Bearer ${token}`,
    'x-uniassist-internal-kid': kid,
    'x-uniassist-internal-ts': ts,
    'x-uniassist-internal-nonce': nonce,
    'x-uniassist-internal-signature': signature,
  };
}

export async function verifyInternalAuthRequest(
  input: VerifyInternalAuthRequestInput,
): Promise<InternalAuthVerificationResult> {
  const authHeader = readSingleHeader(input.headers, 'authorization');
  const kidHeader = readSingleHeader(input.headers, 'x-uniassist-internal-kid');
  const tsHeader = readSingleHeader(input.headers, 'x-uniassist-internal-ts');
  const nonceHeader = readSingleHeader(input.headers, 'x-uniassist-internal-nonce');
  const signatureHeader = readSingleHeader(input.headers, 'x-uniassist-internal-signature');

  if (!authHeader || !kidHeader || !tsHeader || !nonceHeader || !signatureHeader) {
    return {
      ok: false,
      code: 'AUTH_MISSING',
      message: 'internal auth headers are missing',
      status: 401,
    };
  }

  const token = parseBearerToken(authHeader);
  if (!token) {
    return {
      ok: false,
      code: 'AUTH_MISSING',
      message: 'bearer token is missing',
      status: 401,
    };
  }

  const nowMs = input.nowMs ?? Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const jwtVerify = verifyJwtToken(token, input.config, input.expectedAudience, nowSec);
  if (!jwtVerify.ok) {
    return jwtVerify;
  }

  if (kidHeader !== jwtVerify.kid) {
    return {
      ok: false,
      code: 'AUTH_TOKEN_INVALID',
      message: 'kid header mismatch',
      status: 401,
      claims: jwtVerify.claims,
    };
  }

  const tsMs = Number(tsHeader);
  if (!Number.isFinite(tsMs)) {
    return {
      ok: false,
      code: 'AUTH_SIGNATURE_INVALID',
      message: 'timestamp is invalid',
      status: 401,
      claims: jwtVerify.claims,
    };
  }

  const driftMs = Math.abs(nowMs - tsMs);
  const allowedDriftMs = input.config.nonceTtlSec * 1000;
  if (driftMs > allowedDriftMs) {
    return {
      ok: false,
      code: 'AUTH_SIGNATURE_INVALID',
      message: 'timestamp expired',
      status: 401,
      claims: jwtVerify.claims,
    };
  }

  const signaturePayload = buildSignaturePayload(
    tsHeader,
    nonceHeader,
    input.method,
    input.path,
    input.rawBody || '',
  );
  const expectedSignature = hmacHex(jwtVerify.secret, signaturePayload);
  if (!timingSafeEqualHex(signatureHeader, expectedSignature)) {
    return {
      ok: false,
      code: 'AUTH_SIGNATURE_INVALID',
      message: 'request signature invalid',
      status: 401,
      claims: jwtVerify.claims,
    };
  }

  const replayOk = await input.nonceStore.setIfAbsent(
    `${jwtVerify.claims.sub}:${nonceHeader}`,
    input.config.nonceTtlSec * 1000,
  );
  if (!replayOk) {
    return {
      ok: false,
      code: 'AUTH_REPLAY',
      message: 'nonce replay detected',
      status: 401,
      claims: jwtVerify.claims,
    };
  }

  if (input.allowedSubjects && input.allowedSubjects.length > 0 && !input.allowedSubjects.includes(jwtVerify.claims.sub)) {
    return {
      ok: false,
      code: 'AUTH_TOKEN_INVALID',
      message: 'subject is not allowed',
      status: 401,
      claims: jwtVerify.claims,
    };
  }

  if (input.requiredScopes && input.requiredScopes.length > 0) {
    const scopeSet = new Set(parseScope(jwtVerify.claims.scope));
    const missing = input.requiredScopes.find((scope) => !scopeSet.has(scope) && !scopeSet.has('*'));
    if (missing) {
      return {
        ok: false,
        code: 'AUTH_SCOPE_MISSING',
        message: `missing required scope: ${missing}`,
        status: 403,
        claims: jwtVerify.claims,
      };
    }
  }

  return {
    ok: true,
    claims: jwtVerify.claims,
    kid: jwtVerify.kid,
  };
}
