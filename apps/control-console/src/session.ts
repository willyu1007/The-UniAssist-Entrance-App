export type ControlConsoleIdentity = {
  sessionId: string;
  userId: string;
};

const SESSION_STORAGE_KEY = 'ua-control-console.session-id';
const USER_STORAGE_KEY = 'ua-control-console.user-id';

function createUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `fallback-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}

export function createTraceId(): string {
  return createUuid();
}

export function readOrCreateIdentity(): ControlConsoleIdentity {
  if (typeof window === 'undefined') {
    return {
      sessionId: 'console-session-server',
      userId: 'console-user-server',
    };
  }

  const storedSessionId = window.localStorage.getItem(SESSION_STORAGE_KEY);
  const storedUserId = window.localStorage.getItem(USER_STORAGE_KEY);
  const sessionId = storedSessionId || `console-session-${createUuid()}`;
  const userId = storedUserId || `console-user-${createUuid()}`;

  if (!storedSessionId) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }
  if (!storedUserId) {
    window.localStorage.setItem(USER_STORAGE_KEY, userId);
  }

  return {
    sessionId,
    userId,
  };
}
