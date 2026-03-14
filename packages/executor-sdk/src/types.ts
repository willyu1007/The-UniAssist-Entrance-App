import type {
  BridgeHealth,
  BridgeManifest,
  BridgeRegistrationRecord,
  ExternalRuntimeBridgeCancelRequest,
  ExternalRuntimeBridgeCancelResponse,
  ExternalRuntimeBridgeInvokeRequest,
  ExternalRuntimeBridgeInvokeResponse,
  ExternalRuntimeBridgeResumeRequest,
  ExternalRuntimeBridgeResumeResponse,
} from '@uniassist/workflow-contracts';

export type ExternalBridgeClient = {
  getManifest: (bridge: Pick<BridgeRegistrationRecord, 'bridgeId' | 'baseUrl' | 'serviceId'>) => Promise<BridgeManifest>;
  getHealth: (bridge: Pick<BridgeRegistrationRecord, 'bridgeId' | 'baseUrl' | 'serviceId'>) => Promise<BridgeHealth>;
  invoke: (
    bridge: Pick<BridgeRegistrationRecord, 'bridgeId' | 'baseUrl' | 'serviceId'>,
    body: ExternalRuntimeBridgeInvokeRequest,
  ) => Promise<ExternalRuntimeBridgeInvokeResponse>;
  resume: (
    bridge: Pick<BridgeRegistrationRecord, 'bridgeId' | 'baseUrl' | 'serviceId'>,
    body: ExternalRuntimeBridgeResumeRequest,
  ) => Promise<ExternalRuntimeBridgeResumeResponse>;
  cancel: (
    bridge: Pick<BridgeRegistrationRecord, 'bridgeId' | 'baseUrl' | 'serviceId'>,
    body: ExternalRuntimeBridgeCancelRequest,
  ) => Promise<ExternalRuntimeBridgeCancelResponse>;
};
