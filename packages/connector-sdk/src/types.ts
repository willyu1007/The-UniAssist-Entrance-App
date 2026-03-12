import type {
  ConnectorActionExecutionSnapshot,
  ConnectorCatalog,
  ConnectorRuntimeInvokeRequest,
} from '@baseinterface/workflow-contracts';

export type ConnectorAdapterInvokeResult =
  | {
      status: 'completed';
      externalSessionRef: string;
      completion?: import('@baseinterface/workflow-contracts').WorkflowCompatCompletionMetadata;
      metadata?: Record<string, unknown>;
    }
  | {
      status: 'accepted';
      externalSessionRef: string;
      metadata?: Record<string, unknown>;
    };

export type NormalizedConnectorActionCallback = {
  receiptKey: string;
  callbackId: string;
  sequence: number;
  externalSessionRef: string;
  kind: 'checkpoint' | 'result' | 'error';
  emittedAt: number;
  payload?: Record<string, unknown>;
};

export type NormalizedConnectorEvent = {
  receiptKey: string;
  firedAt: number;
  payload?: Record<string, unknown>;
};

export type ConnectorAdapter = {
  connectorKey: string;
  catalog: ConnectorCatalog;
  invoke: (input: {
    request: ConnectorRuntimeInvokeRequest;
    action: ConnectorActionExecutionSnapshot;
  }) => Promise<ConnectorAdapterInvokeResult>;
  parseActionCallback?: (input: {
    action: ConnectorActionExecutionSnapshot;
    rawBody: string;
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }) => NormalizedConnectorActionCallback;
  parseEvent?: (input: {
    eventType: string;
    rawBody: string;
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }) => NormalizedConnectorEvent;
};

export type ConnectorRuntimeClient = {
  invoke: (body: ConnectorRuntimeInvokeRequest) => Promise<import('@baseinterface/workflow-contracts').ConnectorRuntimeInvokeResponse>;
};
