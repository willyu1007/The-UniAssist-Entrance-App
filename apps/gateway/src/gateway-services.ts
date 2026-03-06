import type { InteractionEvent, UnifiedUserInput, UserInteraction } from '@baseinterface/contracts';

import type { AuthGuards } from './gateway-auth';
import type { ProviderClient } from './gateway-provider-client';
import type { SessionService } from './gateway-sessions';
import type { TaskThreadService } from './gateway-task-threads';
import type { TimelineService } from './gateway-timeline';
import type { UserContextService } from './gateway-user-context';
import type { GatewayObservability } from './observability';
import type { GatewayPersistence } from './persistence';
import type { SessionState, TaskThreadState } from './gateway-types';

type LoggerLike = {
  info: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  error: (msg: string, fields?: Record<string, unknown>) => void;
};

export type GatewayServiceBundle = {
  persistence: GatewayPersistence;
  observability: GatewayObservability;
  logger: LoggerLike;
  serializeError: (error: unknown) => Record<string, unknown>;
  internalAuthServiceId: string;
  sessionService: SessionService;
  timelineService: TimelineService;
  taskThreadService: TaskThreadService;
  providerClient: ProviderClient;
  authGuards: AuthGuards;
  userContextService: UserContextService;
  now: () => number;
  uuid: () => string;
};

export type EmitProviderEvents = (
  session: SessionState,
  input: UnifiedUserInput,
  providerId: string,
  runId: string,
  events: InteractionEvent[],
) => Promise<void>;

export type SendProviderInteraction = (
  interaction: UserInteraction,
  session: SessionState,
  inputRef: UnifiedUserInput,
  thread?: TaskThreadState,
) => Promise<void>;
