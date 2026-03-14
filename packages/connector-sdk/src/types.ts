import type {
  ConnectorActionExecutionSnapshot,
  ConnectorCatalog,
  ConnectorRuntimeInvokeRequest,
  WorkflowExternalLedgerResult,
} from '@baseinterface/workflow-contracts';

export type ConnectorAdapterInvokeResult =
  | {
      status: 'completed';
      externalSessionRef: string;
      result?: WorkflowExternalLedgerResult;
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

export type ConnectorRegistryEntry = {
  connectorKey: string;
  packageName: string;
  exportName?: string;
  enabled: boolean;
};

export type ConnectorModuleLoader = (specifier: string) => Promise<unknown>;

const DEFAULT_CONNECTOR_REGISTRY: ConnectorRegistryEntry[] = [
  {
    connectorKey: 'issue_tracker',
    packageName: '@baseinterface/connector-issue-tracker-sample',
    exportName: 'issueTrackerSampleConnector',
    enabled: true,
  },
  {
    connectorKey: 'ci_pipeline',
    packageName: '@baseinterface/connector-ci-pipeline-sample',
    exportName: 'ciPipelineSampleConnector',
    enabled: true,
  },
  {
    connectorKey: 'source_control',
    packageName: '@baseinterface/connector-source-control-sample',
    exportName: 'sourceControlSampleConnector',
    enabled: true,
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Array.isArray(value) === false;
}

function isConnectorAdapter(value: unknown): value is ConnectorAdapter {
  return isRecord(value)
    && typeof value.connectorKey === 'string'
    && isRecord(value.catalog)
    && Array.isArray(value.catalog.actions)
    && Array.isArray(value.catalog.events)
    && typeof value.invoke === 'function';
}

export function parseConnectorRegistryFromEnv(env: NodeJS.ProcessEnv): ConnectorRegistryEntry[] {
  const raw = env.UNIASSIST_CONNECTOR_REGISTRY_JSON?.trim();
  if (!raw) {
    return DEFAULT_CONNECTOR_REGISTRY.map((entry) => ({ ...entry }));
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return DEFAULT_CONNECTOR_REGISTRY.map((entry) => ({ ...entry }));
    }
    const normalized = parsed
      .filter(isRecord)
      .filter((item) => typeof item.connectorKey === 'string' && typeof item.packageName === 'string')
      .map((item) => ({
        connectorKey: String(item.connectorKey),
        packageName: String(item.packageName),
        exportName: typeof item.exportName === 'string' && item.exportName.trim().length > 0
          ? item.exportName
          : undefined,
        enabled: item.enabled !== false,
      }));
    return normalized.length > 0 ? normalized : DEFAULT_CONNECTOR_REGISTRY.map((entry) => ({ ...entry }));
  } catch {
    return DEFAULT_CONNECTOR_REGISTRY.map((entry) => ({ ...entry }));
  }
}

export function getEnabledConnectorRegistryEntries(entries: ConnectorRegistryEntry[]): ConnectorRegistryEntry[] {
  return entries.filter((entry) => entry.enabled !== false);
}

export function getEnabledConnectorRegistryKeys(entries: ConnectorRegistryEntry[]): Set<string> {
  return new Set(getEnabledConnectorRegistryEntries(entries).map((entry) => entry.connectorKey));
}

export async function loadConnectorAdapters(
  entries: ConnectorRegistryEntry[],
  options: {
    loader?: ConnectorModuleLoader;
  } = {},
): Promise<Map<string, ConnectorAdapter>> {
  const adapters = new Map<string, ConnectorAdapter>();
  const loader = options.loader || ((specifier: string) => import(specifier));
  for (const entry of getEnabledConnectorRegistryEntries(entries)) {
    const moduleValue = await loader(entry.packageName) as Record<string, unknown>;
    const namedExport = entry.exportName ? moduleValue[entry.exportName] : undefined;
    const defaultExport = isConnectorAdapter(moduleValue.default) ? moduleValue.default : undefined;
    const inferredExport = Object.values(moduleValue).find((candidate) => (
      isConnectorAdapter(candidate)
      && candidate.connectorKey === entry.connectorKey
    ));
    const adapterCandidate = namedExport ?? defaultExport ?? inferredExport;
    if (!isConnectorAdapter(adapterCandidate)) {
      throw new Error(
        `connector registry entry ${entry.connectorKey} could not resolve a ConnectorAdapter from ${entry.packageName}`,
      );
    }
    if (adapterCandidate.connectorKey !== entry.connectorKey) {
      throw new Error(
        `connector registry entry ${entry.connectorKey} resolved adapter ${adapterCandidate.connectorKey}`,
      );
    }
    adapters.set(entry.connectorKey, adapterCandidate);
  }
  return adapters;
}
