import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getEnabledConnectorRegistryKeys,
  loadConnectorAdapters,
  parseConnectorRegistryFromEnv,
} from '@baseinterface/connector-sdk';

test('connector registry parsing falls back to default samples when env is absent or invalid', () => {
  const defaults = parseConnectorRegistryFromEnv({});
  assert.deepEqual(
    defaults.map((entry) => entry.connectorKey),
    ['issue_tracker', 'ci_pipeline', 'source_control'],
  );

  const invalid = parseConnectorRegistryFromEnv({
    UNIASSIST_CONNECTOR_REGISTRY_JSON: '{"not":"an-array"}',
  } as NodeJS.ProcessEnv);
  assert.deepEqual(
    invalid.map((entry) => entry.connectorKey),
    ['issue_tracker', 'ci_pipeline', 'source_control'],
  );
});

test('connector registry filters enabled connectors and dynamically loads adapters', async () => {
  const registry = parseConnectorRegistryFromEnv({
    UNIASSIST_CONNECTOR_REGISTRY_JSON: JSON.stringify([
      {
        connectorKey: 'ci_pipeline',
        packageName: '@baseinterface/connector-ci-pipeline-sample',
        exportName: 'ciPipelineSampleConnector',
        enabled: true,
      },
      {
        connectorKey: 'issue_tracker',
        packageName: '@baseinterface/connector-issue-tracker-sample',
        exportName: 'issueTrackerSampleConnector',
        enabled: false,
      },
    ]),
  } as NodeJS.ProcessEnv);

  assert.deepEqual([...getEnabledConnectorRegistryKeys(registry)], ['ci_pipeline']);

  const adapters = await loadConnectorAdapters(
    registry,
    { loader: async (specifier) => await import(specifier) },
  );
  assert.deepEqual([...adapters.keys()], ['ci_pipeline']);
  assert.equal(adapters.get('ci_pipeline')?.catalog.actions[0]?.capabilityId, 'pipeline.start');
});

test('connector registry rejects bad exports deterministically', async () => {
  await assert.rejects(
    loadConnectorAdapters([
      {
        connectorKey: 'missing_connector',
        packageName: '@baseinterface/connector-ci-pipeline-sample',
        exportName: 'missingConnectorExport',
        enabled: true,
      },
    ], {
      loader: async (specifier) => await import(specifier),
    }),
    /could not resolve a ConnectorAdapter/,
  );
});
