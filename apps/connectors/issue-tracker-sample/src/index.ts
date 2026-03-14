import type { ConnectorAdapter } from '@uniassist/connector-sdk';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Array.isArray(value) === false;
}

function unwrapScenarioInput(inputPayload: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (isRecord(inputPayload?.input)) {
    return inputPayload.input;
  }
  return inputPayload;
}

function buildInputCandidates(inputPayload: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  const workflow = isRecord(inputPayload?.__workflow) ? inputPayload.__workflow : undefined;
  const workflowRunInput = isRecord(workflow?.runInput) ? workflow.runInput : undefined;
  return [
    unwrapScenarioInput(inputPayload),
    inputPayload,
    unwrapScenarioInput(workflowRunInput),
    workflowRunInput,
  ].filter((candidate): candidate is Record<string, unknown> => isRecord(candidate));
}

function resolveIssueRef(inputPayload: Record<string, unknown> | undefined, runId: string): string {
  for (const candidate of buildInputCandidates(inputPayload)) {
    if (typeof candidate.issueRef === 'string' && candidate.issueRef) {
      return candidate.issueRef;
    }
    const targets = isRecord(candidate.targets) ? candidate.targets : undefined;
    if (typeof targets?.issueRef === 'string' && targets.issueRef) {
      return targets.issueRef;
    }
  }
  return `ISSUE-${runId.slice(0, 8)}`;
}

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
  invoke: async ({ request, action }) => {
    const issueRef = resolveIssueRef(request.inputPayload, request.runId);
    return {
      status: 'completed',
      externalSessionRef: issueRef,
      result: {
        artifacts: [
          {
            artifactType: 'ActionReceipt',
            state: 'validated',
            payload: {
              connectorKey: 'issue_tracker',
              capabilityId: action.capabilityId,
              sideEffectClass: action.sideEffectClass,
              executionMode: action.executionMode,
              externalRef: issueRef,
              summary: 'Issue ticket upserted successfully.',
              result: {
                issueKey: issueRef,
              },
            },
          },
        ],
      },
    };
  },
};
