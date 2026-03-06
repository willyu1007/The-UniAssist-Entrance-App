import type { GatewayObservability } from './observability';
import type { GatewayPersistence } from './persistence';
import type { UserContextRecord, UserContextResponse } from './gateway-types';

type LoggerLike = {
  error: (msg: string, fields?: Record<string, unknown>) => void;
};

type UserContextDeps = {
  persistence: GatewayPersistence;
  observability: GatewayObservability;
  logger: LoggerLike;
  now: () => number;
  serializeError: (error: unknown) => Record<string, unknown>;
};

export type UserContextService = {
  loadOrGenerate: (profileRef: string) => Promise<UserContextResponse>;
};

export function createUserContextService(deps: UserContextDeps): UserContextService {
  const userContextCache = new Map<string, UserContextRecord>();

  const loadOrGenerate = async (profileRef: string): Promise<UserContextResponse> => {
    const existing = userContextCache.get(profileRef);
    if (existing) {
      return existing.context;
    }

    if (deps.persistence.isEnabled()) {
      const persisted = await deps.persistence.loadUserContext(profileRef);
      if (persisted) {
        const restored = persisted as UserContextResponse;
        userContextCache.set(profileRef, {
          profileRef,
          userId: profileRef.replace(/^profile:/, ''),
          context: restored,
        });
        return restored;
      }
    }

    const generated: UserContextRecord = {
      profileRef,
      userId: profileRef.replace(/^profile:/, ''),
      context: {
        profile: {
          displayName: 'Demo User',
          tags: ['default'],
        },
        preferences: {
          locale: 'zh-CN',
          focusMode: 'balanced',
        },
        consents: {
          profileSharing: true,
        },
        updatedAt: deps.now(),
      },
    };

    userContextCache.set(profileRef, generated);
    if (deps.persistence.isEnabled()) {
      void deps.persistence.saveUserContext({
        profileRef,
        userId: generated.userId,
        snapshot: generated.context as Record<string, unknown>,
        ttlMs: 24 * 60 * 60 * 1000,
      }).catch((error: unknown) => {
        deps.observability.observePersistenceError();
        deps.logger.error('persistence saveUserContext failed', deps.serializeError(error));
      });
    }

    return generated.context;
  };

  return {
    loadOrGenerate,
  };
}
