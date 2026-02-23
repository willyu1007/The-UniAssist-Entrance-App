export type SchemaVersion = 'v0';

export type InputSource = 'app' | 'wechat' | 'web' | 'api';

export type Attachment = {
  id: string;
  type: 'image' | 'audio' | 'file';
  url?: string;
  localUri?: string;
  mime?: string;
  name?: string;
  size?: number;
  sha256?: string;
  width?: number;
  height?: number;
  durationMs?: number;
};

export type UnifiedUserInput = {
  schemaVersion: SchemaVersion;
  traceId: string;
  userId: string;
  sessionId: string;
  source: InputSource;
  channel?: {
    id?: string;
    type?: string;
    messageId?: string;
  };
  text?: string;
  raw?: Record<string, unknown>;
  attachments?: Attachment[];
  locale?: string;
  timezone?: string;
  timestampMs: number;
};

export type RoutingCandidate = {
  providerId: string;
  score: number;
  reason?: string;
  requiresClarification?: boolean;
  suggestedMode?: 'sync' | 'async';
};

export type RoutingDecision = {
  schemaVersion: SchemaVersion;
  traceId: string;
  sessionId: string;
  candidates: RoutingCandidate[];
  requiresUserConfirmation?: boolean;
  fallback?: 'builtin_chat' | 'none';
  timestampMs: number;
};

export type Action = {
  actionId: string;
  label: string;
  style?: 'primary' | 'secondary' | 'danger';
  payload?: Record<string, unknown>;
};

export type Choice = {
  key: string;
  label: string;
};

export type Field =
  | {
      fieldId: string;
      label: string;
      kind: 'text';
      required?: boolean;
      placeholder?: string;
    }
  | {
      fieldId: string;
      label: string;
      kind: 'select';
      required?: boolean;
      options: Choice[];
    }
  | {
      fieldId: string;
      label: string;
      kind: 'date';
      required?: boolean;
    };

export type CoreInteractionEvent =
  | {
      type: 'ack';
      message?: string;
    }
  | {
      type: 'assistant_message';
      text: string;
      markdown?: boolean;
    }
  | {
      type: 'card';
      title: string;
      body?: string;
      actions?: Action[];
      media?: Array<{ type: 'image' | 'audio'; url: string; alt?: string }>;
    }
  | {
      type: 'form';
      formId: string;
      title?: string;
      fields: Field[];
      submit: Action;
    }
  | {
      type: 'nav';
      label: string;
      href: string;
    }
  | {
      type: 'request_clarification';
      question: string;
      choices: Choice[];
      multi?: boolean;
    }
  | {
      type: 'error';
      userMessage: string;
      debugMessage?: string;
      retryable?: boolean;
    };

export type JsonSchema = Record<string, unknown>;

export type DataCollectionRequestExtensionEvent = {
  type: 'provider_extension';
  extensionKind: 'data_collection_request';
  payload: {
    schemaVersion: SchemaVersion;
    providerId: string;
    taskId?: string;
    dataSchema: JsonSchema;
    uiSchema: Record<string, unknown>;
    status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  };
};

export type DataCollectionProgressExtensionEvent = {
  type: 'provider_extension';
  extensionKind: 'data_collection_progress';
  payload: {
    schemaVersion: SchemaVersion;
    providerId: string;
    taskId?: string;
    progress: {
      step: number;
      total: number;
      label?: string;
    };
    status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  };
};

export type DataCollectionResultExtensionEvent = {
  type: 'provider_extension';
  extensionKind: 'data_collection_result';
  payload: {
    schemaVersion: SchemaVersion;
    providerId: string;
    taskId?: string;
    dataSchema: JsonSchema;
    uiSchema: Record<string, unknown>;
    values?: Record<string, unknown>;
    status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  };
};

export type ProviderExtensionInteractionEvent =
  | DataCollectionRequestExtensionEvent
  | DataCollectionProgressExtensionEvent
  | DataCollectionResultExtensionEvent;

export type InteractionEvent = CoreInteractionEvent | ProviderExtensionInteractionEvent;

export type UserInteraction = {
  schemaVersion: SchemaVersion;
  traceId: string;
  sessionId: string;
  userId: string;
  providerId: string;
  runId: string;
  actionId: string;
  payload?: Record<string, unknown>;
  timestampMs: number;
};

export type DomainEvent = {
  schemaVersion: SchemaVersion;
  traceId?: string;
  sessionId?: string;
  userId: string;
  providerId: string;
  eventType: 'reminder' | 'progress' | 'approval_required' | 'exception' | 'summary';
  title: string;
  body?: string;
  severity?: 'info' | 'warning' | 'critical';
  related?: {
    runId?: string;
    taskId?: string;
    href?: string;
  };
  timestampMs: number;
};

export type TimelineEventKind =
  | 'inbound'
  | 'routing_decision'
  | 'provider_run'
  | 'interaction'
  | 'user_interaction'
  | 'domain_event'
  | 'delivery_event'
  | 'error';

export type TimelineEvent = {
  schemaVersion: SchemaVersion;
  eventId: string;
  traceId: string;
  sessionId: string;
  userId: string;
  providerId?: string;
  runId?: string;
  seq: number;
  timestampMs: number;
  kind: TimelineEventKind;
  extensionKind?: ProviderExtensionInteractionEvent['extensionKind'];
  renderSchemaRef?: string;
  payload: Record<string, unknown>;
};

export type ContextPackage = {
  schemaVersion: SchemaVersion;
  user: {
    userId: string;
    locale?: string;
    timezone?: string;
  };
  profileSnapshot?: {
    displayName?: string;
    tags?: string[];
  };
  profileRef?: string;
  session?: {
    sessionId: string;
    recentSummary?: string;
    recentEventsCursor?: number;
  };
  memoryPointers?: Array<{
    providerId?: string;
    type: 'vector' | 'db' | 'file';
    ref: string;
    description?: string;
  }>;
  permissions: string[];
  policies?: Record<string, unknown>;
};

export type IngestAck = {
  schemaVersion: SchemaVersion;
  traceId: string;
  sessionId: string;
  userId: string;
  routing?: RoutingDecision;
  runs: Array<{
    providerId: string;
    runId: string;
    mode: 'async' | 'sync';
  }>;
  ackEvents: InteractionEvent[];
  stream: {
    type: 'ws' | 'sse';
    href: string;
    cursor?: number;
  };
  timestampMs: number;
};

export type ProviderManifest = {
  schemaVersion: SchemaVersion;
  providerId: string;
  name: string;
  version: string;
  description: string;
  capabilities: {
    inputs: Array<'text' | 'image' | 'audio' | 'file'>;
    interactionEvents: string[];
    streaming: boolean;
  };
  navigation?: {
    settingsHref?: string;
    detailHref?: string;
    progressHref?: string;
  };
  sla?: {
    ackWithinMs?: number;
    maxSyncResponseMs?: number;
  };
  security?: {
    auth?: 'client_credentials' | 'none';
    requiredScopes?: string[];
  };
};

export type ProviderInvokeRequest = {
  schemaVersion: SchemaVersion;
  input: UnifiedUserInput;
  context: ContextPackage;
  run: {
    runId: string;
    providerId: string;
    attempt: number;
    idempotencyKey: string;
  };
};

export type ProviderInvokeResponse = {
  schemaVersion: SchemaVersion;
  runId: string;
  providerId: string;
  ack: InteractionEvent;
  immediateEvents?: InteractionEvent[];
};

export type ProviderInteractRequest = {
  schemaVersion: SchemaVersion;
  interaction: UserInteraction;
  context: ContextPackage;
  run: {
    runId: string;
    attempt: number;
    idempotencyKey: string;
  };
};

export type ProviderInteractResponse = {
  schemaVersion: SchemaVersion;
  runId: string;
  events: InteractionEvent[];
};

export type ProviderEventsRequest = {
  schemaVersion: SchemaVersion;
  providerId: string;
  events: Array<
    | {
        kind: 'interaction';
        traceId: string;
        sessionId: string;
        userId: string;
        runId: string;
        event: InteractionEvent;
        timestampMs: number;
      }
    | {
        kind: 'domain_event';
        event: DomainEvent;
      }
  >;
  signature?: string;
  timestampMs: number;
};
