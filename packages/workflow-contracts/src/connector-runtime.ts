import type { WorkflowCompatCompletionMetadata, WorkflowSchemaVersion } from './types';

export type ConnectorDefinitionStatus = 'draft' | 'active' | 'disabled' | 'archived';
export type ConnectorBindingStatus = 'draft' | 'active' | 'disabled' | 'archived';
export type ActionBindingStatus = 'draft' | 'active' | 'disabled' | 'archived';
export type EventSubscriptionStatus = 'draft' | 'active' | 'disabled' | 'archived';

export type ConnectorCapabilityExecutionMode = 'sync' | 'async';
export type ConnectorCapabilitySideEffectClass = 'read' | 'write';
export type BrowserFallbackMode = 'disabled' | 'query_only';
export type ConnectorActionSessionStatus =
  | 'running'
  | 'waiting_callback'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type ConnectorCallbackKind = 'checkpoint' | 'result' | 'error';
export type ConnectorEventReceiptSourceKind = 'action_callback' | 'event_subscription';
export type ConnectorEventReceiptStatus = 'accepted' | 'duplicate' | 'rejected';

export type ConnectorActionCatalogEntry = {
  capabilityId: string;
  name: string;
  description?: string;
  executionMode: ConnectorCapabilityExecutionMode;
  sideEffectClass: ConnectorCapabilitySideEffectClass;
  supportsBrowserFallback: boolean;
  metadata?: Record<string, unknown>;
};

export type ConnectorEventCatalogEntry = {
  eventType: string;
  description?: string;
  deliveryMode: 'webhook';
  metadata?: Record<string, unknown>;
};

export type ConnectorCatalog = {
  actions: ConnectorActionCatalogEntry[];
  events: ConnectorEventCatalogEntry[];
  metadata?: Record<string, unknown>;
};

export type ConnectorDefinitionRecord = {
  connectorDefinitionId: string;
  workspaceId: string;
  connectorKey: string;
  name: string;
  description?: string;
  status: ConnectorDefinitionStatus;
  catalogJson: ConnectorCatalog;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type ConnectorBindingRecord = {
  connectorBindingId: string;
  workspaceId: string;
  connectorDefinitionId: string;
  name: string;
  description?: string;
  status: ConnectorBindingStatus;
  secretRefId?: string;
  metadataJson?: Record<string, unknown>;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type ActionBindingRecord = {
  actionBindingId: string;
  workspaceId: string;
  agentId: string;
  actionRef: string;
  connectorBindingId: string;
  capabilityId: string;
  status: ActionBindingStatus;
  sideEffectClass: ConnectorCapabilitySideEffectClass;
  executionMode: ConnectorCapabilityExecutionMode;
  timeoutMs?: number;
  browserFallbackMode: BrowserFallbackMode;
  configJson: Record<string, unknown>;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type EventSubscriptionRecord = {
  eventSubscriptionId: string;
  workspaceId: string;
  connectorBindingId: string;
  triggerBindingId: string;
  eventType: string;
  status: EventSubscriptionStatus;
  publicSubscriptionKey?: string;
  configJson: Record<string, unknown>;
  lastEventAt?: number;
  lastError?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type ConnectorActionSessionRecord = {
  connectorActionSessionId: string;
  runId: string;
  nodeRunId: string;
  actionBindingId: string;
  connectorBindingId: string;
  capabilityId: string;
  externalSessionRef: string;
  publicCallbackKey: string;
  status: ConnectorActionSessionStatus;
  lastSequence: number;
  cancelledAt?: number;
  metadataJson?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type ConnectorEventReceiptRecord = {
  connectorEventReceiptId: string;
  receiptKey: string;
  sourceKind: ConnectorEventReceiptSourceKind;
  connectorActionSessionId?: string;
  eventSubscriptionId?: string;
  sequence?: number;
  eventType?: string;
  status: ConnectorEventReceiptStatus;
  errorMessage?: string;
  receivedAt: number;
};

export type ActionReceiptPayload = {
  connectorKey: string;
  capabilityId: string;
  sideEffectClass: ConnectorCapabilitySideEffectClass;
  executionMode: ConnectorCapabilityExecutionMode;
  externalRef?: string;
  summary: string;
  result?: Record<string, unknown>;
};

export type ValidationReportPayload = {
  pipelineRef: string;
  status: 'passed' | 'failed';
  summary: string;
  details?: Record<string, unknown>;
};

export type ConnectorDefinitionListResponse = {
  schemaVersion: WorkflowSchemaVersion;
  connectorDefinitions: ConnectorDefinitionRecord[];
};

export type ConnectorDefinitionResponse = {
  schemaVersion: WorkflowSchemaVersion;
  connectorDefinition: ConnectorDefinitionRecord;
};

export type ConnectorDefinitionCreateRequest = {
  schemaVersion: WorkflowSchemaVersion;
  workspaceId: string;
  userId: string;
  connectorKey: string;
  name: string;
  description?: string;
  catalogJson: ConnectorCatalog;
};

export type ConnectorBindingListResponse = {
  schemaVersion: WorkflowSchemaVersion;
  connectorBindings: ConnectorBindingRecord[];
};

export type ConnectorBindingResponse = {
  schemaVersion: WorkflowSchemaVersion;
  connectorBinding: ConnectorBindingRecord;
};

export type ConnectorBindingCreateRequest = {
  schemaVersion: WorkflowSchemaVersion;
  workspaceId: string;
  userId: string;
  connectorDefinitionId: string;
  name: string;
  description?: string;
  secretRefId?: string;
  metadataJson?: Record<string, unknown>;
};

export type ActionBindingListResponse = {
  schemaVersion: WorkflowSchemaVersion;
  actionBindings: ActionBindingRecord[];
};

export type ActionBindingResponse = {
  schemaVersion: WorkflowSchemaVersion;
  actionBinding: ActionBindingRecord;
};

export type ActionBindingCreateRequest = {
  schemaVersion: WorkflowSchemaVersion;
  workspaceId: string;
  userId: string;
  actionRef: string;
  connectorBindingId: string;
  capabilityId: string;
  sideEffectClass: ConnectorCapabilitySideEffectClass;
  executionMode: ConnectorCapabilityExecutionMode;
  timeoutMs?: number;
  browserFallbackMode?: BrowserFallbackMode;
  configJson?: Record<string, unknown>;
};

export type EventSubscriptionListResponse = {
  schemaVersion: WorkflowSchemaVersion;
  eventSubscriptions: EventSubscriptionRecord[];
};

export type EventSubscriptionResponse = {
  schemaVersion: WorkflowSchemaVersion;
  eventSubscription: EventSubscriptionRecord;
};

export type EventSubscriptionCreateRequest = {
  schemaVersion: WorkflowSchemaVersion;
  workspaceId: string;
  userId: string;
  connectorBindingId: string;
  triggerBindingId: string;
  eventType: string;
  configJson?: Record<string, unknown>;
};

export type ConnectorActionExecutionSnapshot = {
  actionRef: string;
  actionBindingId: string;
  connectorBindingId: string;
  connectorKey: string;
  capabilityId: string;
  sideEffectClass: ConnectorCapabilitySideEffectClass;
  executionMode: ConnectorCapabilityExecutionMode;
  timeoutMs?: number;
  browserFallbackMode: BrowserFallbackMode;
  configJson: Record<string, unknown>;
};

export type ConnectorRuntimeCallbackConfig = {
  url: string;
};

export type ConnectorRuntimeInvokeRequest = {
  schemaVersion: WorkflowSchemaVersion;
  traceId: string;
  workspaceId: string;
  runId: string;
  nodeRunId: string;
  sessionId: string;
  userId: string;
  action: ConnectorActionExecutionSnapshot;
  inputPayload?: Record<string, unknown>;
  callback: ConnectorRuntimeCallbackConfig;
  metadata?: Record<string, unknown>;
};

export type ConnectorRuntimeInvokeResponse =
  | {
      schemaVersion: WorkflowSchemaVersion;
      status: 'completed';
      externalSessionRef: string;
      completion?: WorkflowCompatCompletionMetadata;
      metadata?: Record<string, unknown>;
    }
  | {
      schemaVersion: WorkflowSchemaVersion;
      status: 'accepted';
      externalSessionRef: string;
      publicCallbackKey: string;
      metadata?: Record<string, unknown>;
    };

export type WorkflowRuntimeConnectorCallbackRequest = {
  schemaVersion: WorkflowSchemaVersion;
  traceId: string;
  callbackId: string;
  sequence: number;
  connectorActionSessionId: string;
  runId: string;
  nodeRunId: string;
  externalSessionRef: string;
  kind: ConnectorCallbackKind;
  emittedAt: number;
  payload?: Record<string, unknown>;
};

export type WorkflowRuntimeConnectorCallbackResponse = {
  schemaVersion: WorkflowSchemaVersion;
  accepted: boolean;
  duplicate?: boolean;
  receipt: ConnectorEventReceiptRecord;
};

export type WorkflowRuntimeConnectorActionSessionLookupResponse = {
  schemaVersion: WorkflowSchemaVersion;
  session: {
    connectorActionSessionId: string;
    publicCallbackKey: string;
    runId: string;
    nodeRunId: string;
    externalSessionRef: string;
    connectorKey: string;
    action: ConnectorActionExecutionSnapshot;
  };
};

export type EventSubscriptionRuntimeConfig = {
  eventSubscriptionId: string;
  triggerBindingId: string;
  publicSubscriptionKey: string;
  connectorKey: string;
  eventType: string;
  secretRefId?: string;
  secretEnvKey?: string;
  signatureHeader?: string;
  timestampHeader?: string;
  dedupeHeader?: string;
  replayWindowMs?: number;
};

export type EventSubscriptionRuntimeConfigResponse = {
  schemaVersion: WorkflowSchemaVersion;
  eventSubscription: EventSubscriptionRuntimeConfig;
};

export type EventSubscriptionDispatchRequest = {
  schemaVersion: WorkflowSchemaVersion;
  dispatchKey: string;
  firedAt: number;
  payload?: Record<string, unknown>;
  headers?: Record<string, string>;
};

export type EventSubscriptionDispatchResponse = {
  schemaVersion: WorkflowSchemaVersion;
  runId?: string;
  duplicate?: boolean;
  eventSubscription: EventSubscriptionRecord;
};
