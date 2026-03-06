import type { Request } from 'express';

import type { ProviderManifest, TaskExecutionPolicy, TaskLifecycleState } from '@baseinterface/contracts';
import type { StoredSession } from './persistence';

export type RawBodyRequest = Request & { rawBody?: string };

export type SessionState = StoredSession;

export type ProviderRegistryEntry = {
  providerId: string;
  serviceId: string;
  baseUrl?: string;
  keywords: string[];
  enabled: boolean;
  manifest?: ProviderManifest;
};

export type TaskThreadState = {
  taskId: string;
  sessionId: string;
  providerId: string;
  runId: string;
  state: TaskLifecycleState;
  executionPolicy: TaskExecutionPolicy;
  activeQuestionId?: string;
  activeReplyToken?: string;
  metadata?: Record<string, unknown>;
  updatedAt: number;
};

export type UserContextResponse = {
  profile: {
    displayName: string;
    tags?: string[];
  };
  preferences: Record<string, unknown>;
  consents: Record<string, boolean>;
  updatedAt: number;
};

export type UserContextRecord = {
  profileRef: string;
  userId: string;
  context: UserContextResponse;
};
