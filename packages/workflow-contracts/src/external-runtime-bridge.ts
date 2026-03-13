export type BridgeRegistrationStatus =
  | 'registered'
  | 'active'
  | 'suspended'
  | 'deprecated';

export type BridgeRuntimeType = 'external_agent_runtime';

export type BridgeCallbackMode = 'async_webhook';

export type BridgeHealthStatus = 'ok' | 'degraded' | 'down';

export type BridgeSessionStatus =
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BridgeCallbackKind =
  | 'checkpoint'
  | 'approval.requested'
  | 'result'
  | 'error';

export type BridgeCallbackReceiptStatus = 'accepted' | 'duplicate' | 'rejected';

export type BridgeManifestCapability = {
  capabilityId: string;
  name: string;
  description?: string;
  inputSchemaRef?: string;
  outputSchemaRef?: string;
  supportsResume: boolean;
  supportsCancel: boolean;
  supportsApproval: boolean;
  metadata?: Record<string, unknown>;
};

export type BridgeManifest = {
  schemaVersion: 'v1';
  bridgeVersion: string;
  runtimeType: BridgeRuntimeType;
  displayName: string;
  callbackMode: BridgeCallbackMode;
  supportsResume: boolean;
  supportsCancel: boolean;
  capabilities: BridgeManifestCapability[];
  metadata?: Record<string, unknown>;
};

export type BridgeHealth = {
  schemaVersion: 'v1';
  status: BridgeHealthStatus;
  checkedAt: number;
  details?: Record<string, unknown>;
};

export type BridgeRegistrationRecord = {
  bridgeId: string;
  workspaceId: string;
  name: string;
  description?: string;
  baseUrl: string;
  serviceId: string;
  status: BridgeRegistrationStatus;
  runtimeType: BridgeRuntimeType;
  manifestJson: BridgeManifest;
  healthJson?: BridgeHealth;
  authConfigJson: Record<string, unknown>;
  callbackConfigJson: Record<string, unknown>;
  lastHealthAt?: number;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type ExternalRuntimeBridgeSnapshot = {
  bridgeId: string;
  workspaceId: string;
  name: string;
  baseUrl: string;
  serviceId: string;
  runtimeType: BridgeRuntimeType;
  manifest: BridgeManifest;
  authConfigJson: Record<string, unknown>;
  callbackConfigJson: Record<string, unknown>;
  callbackUrl: string;
};

export type BridgeInvokeSessionRecord = {
  bridgeSessionId: string;
  runId: string;
  nodeRunId: string;
  bridgeId: string;
  externalSessionRef: string;
  status: BridgeSessionStatus;
  lastSequence: number;
  resumeToken?: string;
  cancelledAt?: number;
  metadataJson?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type BridgeCallbackReceiptRecord = {
  callbackReceiptId: string;
  callbackId: string;
  bridgeSessionId: string;
  sequence: number;
  kind: BridgeCallbackKind;
  status: BridgeCallbackReceiptStatus;
  errorMessage?: string;
  receivedAt: number;
};

export type BridgeRegistrationListResponse = {
  schemaVersion: 'v1';
  bridges: BridgeRegistrationRecord[];
};

export type BridgeRegistrationResponse = {
  schemaVersion: 'v1';
  bridge: BridgeRegistrationRecord;
};

export type BridgeRegistrationCreateRequest = {
  schemaVersion: 'v1';
  workspaceId: string;
  userId: string;
  name: string;
  baseUrl: string;
  serviceId: string;
  description?: string;
  authConfigJson?: Record<string, unknown>;
  callbackConfigJson?: Record<string, unknown>;
};

export type BridgeRegistrationLifecycleRequest = {
  schemaVersion: 'v1';
  userId: string;
  summary?: string;
  justification?: string;
};

export type AgentRunStartRequest = {
  schemaVersion: 'v1';
  traceId: string;
  sessionId: string;
  userId: string;
  inputText?: string;
  inputPayload?: Record<string, unknown>;
};

export type WorkflowRunCancelRequest = {
  schemaVersion: 'v1';
  traceId: string;
  userId: string;
  reason?: string;
};

export type WorkflowRuntimeBridgeCallbackRequest = {
  schemaVersion: 'v1';
  traceId: string;
  callbackId: string;
  sequence: number;
  bridgeId: string;
  runId: string;
  nodeRunId?: string;
  externalSessionRef: string;
  kind: BridgeCallbackKind;
  emittedAt: number;
  payload?: Record<string, unknown>;
};

export type WorkflowRuntimeBridgeCallbackResponse = {
  schemaVersion: 'v1';
  accepted: boolean;
  duplicate?: boolean;
  receipt: BridgeCallbackReceiptRecord;
};

export type ExternalRuntimeBridgeCallbackConfig = {
  url: string;
};

export type ExternalRuntimeBridgeInvokeRequest = {
  schemaVersion: 'v1';
  traceId: string;
  bridgeId: string;
  agentId: string;
  runId: string;
  nodeRunId: string;
  workflowKey: string;
  sessionId: string;
  userId: string;
  workspaceId: string;
  capabilityRef?: string;
  inputText?: string;
  inputPayload?: Record<string, unknown>;
  context: {
    nodeKey: string;
    nodeType: string;
    nodeConfig?: Record<string, unknown>;
    runInput?: Record<string, unknown>;
    upstreamArtifactRefs: Array<{
      artifactId: string;
      artifactType: string;
      state: string;
    }>;
  };
  callback: ExternalRuntimeBridgeCallbackConfig;
  metadata?: Record<string, unknown>;
};

export type ExternalRuntimeBridgeInvokeResponse = {
  schemaVersion: 'v1';
  status: 'accepted';
  externalSessionRef: string;
  metadata?: Record<string, unknown>;
};

export type ExternalRuntimeBridgeResumeRequest = {
  schemaVersion: 'v1';
  traceId: string;
  bridgeId: string;
  bridgeSessionId: string;
  agentId: string;
  runId: string;
  nodeRunId: string;
  externalSessionRef: string;
  sessionId: string;
  userId: string;
  workspaceId: string;
  resumeToken?: string;
  payload?: Record<string, unknown>;
  decision?: 'approved' | 'rejected';
  comment?: string;
  callback: ExternalRuntimeBridgeCallbackConfig;
  metadata?: Record<string, unknown>;
};

export type ExternalRuntimeBridgeResumeResponse = {
  schemaVersion: 'v1';
  status: 'accepted';
  externalSessionRef: string;
  metadata?: Record<string, unknown>;
};

export type ExternalRuntimeBridgeCancelRequest = {
  schemaVersion: 'v1';
  traceId: string;
  bridgeId: string;
  bridgeSessionId: string;
  runId: string;
  nodeRunId: string;
  externalSessionRef: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type ExternalRuntimeBridgeCancelResponse = {
  schemaVersion: 'v1';
  status: 'accepted' | 'cancelled';
  externalSessionRef: string;
  metadata?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Array.isArray(value) === false;
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function expectBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function expectNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isFinite(value) === false) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

function expectOptionalRecord(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value;
}

function parseBridgeManifestCapability(value: unknown, field: string): BridgeManifestCapability {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object`);
  }
  return {
    capabilityId: expectString(value.capabilityId, `${field}.capabilityId`),
    name: expectString(value.name, `${field}.name`),
    description: value.description === undefined ? undefined : expectString(value.description, `${field}.description`),
    inputSchemaRef: value.inputSchemaRef === undefined ? undefined : expectString(value.inputSchemaRef, `${field}.inputSchemaRef`),
    outputSchemaRef: value.outputSchemaRef === undefined ? undefined : expectString(value.outputSchemaRef, `${field}.outputSchemaRef`),
    supportsResume: expectBoolean(value.supportsResume, `${field}.supportsResume`),
    supportsCancel: expectBoolean(value.supportsCancel, `${field}.supportsCancel`),
    supportsApproval: expectBoolean(value.supportsApproval, `${field}.supportsApproval`),
    metadata: expectOptionalRecord(value.metadata, `${field}.metadata`),
  };
}

export function parseBridgeManifest(value: unknown): BridgeManifest {
  if (!isRecord(value)) {
    throw new Error('bridge manifest must be an object');
  }
  if (value.schemaVersion !== 'v1') {
    throw new Error('bridge manifest schemaVersion must be v1');
  }
  if (value.runtimeType !== 'external_agent_runtime') {
    throw new Error('bridge manifest runtimeType must be external_agent_runtime');
  }
  if (value.callbackMode !== 'async_webhook') {
    throw new Error('bridge manifest callbackMode must be async_webhook');
  }
  if (!Array.isArray(value.capabilities)) {
    throw new Error('bridge manifest capabilities must be an array');
  }
  return {
    schemaVersion: 'v1',
    bridgeVersion: expectString(value.bridgeVersion, 'bridge manifest bridgeVersion'),
    runtimeType: 'external_agent_runtime',
    displayName: expectString(value.displayName, 'bridge manifest displayName'),
    callbackMode: 'async_webhook',
    supportsResume: expectBoolean(value.supportsResume, 'bridge manifest supportsResume'),
    supportsCancel: expectBoolean(value.supportsCancel, 'bridge manifest supportsCancel'),
    capabilities: value.capabilities.map((item, index) => parseBridgeManifestCapability(item, `bridge manifest capabilities[${index}]`)),
    metadata: expectOptionalRecord(value.metadata, 'bridge manifest metadata'),
  };
}

export function parseBridgeHealth(value: unknown): BridgeHealth {
  if (!isRecord(value)) {
    throw new Error('bridge health must be an object');
  }
  if (value.schemaVersion !== 'v1') {
    throw new Error('bridge health schemaVersion must be v1');
  }
  const status = expectString(value.status, 'bridge health status');
  if (!['ok', 'degraded', 'down'].includes(status)) {
    throw new Error('bridge health status must be ok, degraded, or down');
  }
  return {
    schemaVersion: 'v1',
    status: status as BridgeHealthStatus,
    checkedAt: expectNumber(value.checkedAt, 'bridge health checkedAt'),
    details: expectOptionalRecord(value.details, 'bridge health details'),
  };
}
