import type { ConnectorAdapter } from '@baseinterface/connector-sdk';

export const issueTrackerSampleConnector: ConnectorAdapter = {
  connectorKey: 'issue_tracker',
  catalog: {
    actions: [
      {
        capabilityId: 'issue.upsert',
        name: 'Upsert Issue',
        description: 'Create or update a generic issue ticket.',
        executionMode: 'sync',
        sideEffectClass: 'write',
        supportsBrowserFallback: false,
      },
    ],
    events: [],
  },
  invoke: async ({ request, action }) => ({
    status: 'completed',
    externalSessionRef: `issue:${request.runId}:${request.nodeRunId}`,
    completion: {
      artifacts: [
        {
          artifactType: 'ActionReceipt',
          state: 'validated',
          payload: {
            connectorKey: 'issue_tracker',
            capabilityId: action.capabilityId,
            sideEffectClass: action.sideEffectClass,
            executionMode: action.executionMode,
            externalRef: `issue:${request.runId}`,
            summary: 'Issue ticket upserted successfully.',
            result: {
              issueKey: `ISSUE-${request.runId.slice(0, 8)}`,
            },
          },
        },
      ],
    },
  }),
};
