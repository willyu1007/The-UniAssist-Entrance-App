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

function resolveChangeReviewRef(inputPayload: Record<string, unknown> | undefined, runId: string): string {
  for (const candidate of buildInputCandidates(inputPayload)) {
    if (typeof candidate.changeReviewRef === 'string' && candidate.changeReviewRef) {
      return candidate.changeReviewRef;
    }
    const targets = isRecord(candidate.targets) ? candidate.targets : undefined;
    if (typeof targets?.changeReviewRef === 'string' && targets.changeReviewRef) {
      return targets.changeReviewRef;
    }
  }
  return `change-review:${runId}`;
}

export const sourceControlSampleConnector: ConnectorAdapter = {
  connectorKey: 'source_control',
  catalog: {
    actions: [
      {
        capabilityId: 'change_review.upsert',
        name: 'Upsert Change Review',
        description: 'Create or update a generic change review record.',
        executionMode: 'sync',
        sideEffectClass: 'write',
        supportsBrowserFallback: false,
      },
    ],
    events: [],
  },
  invoke: async ({ request, action }) => {
    const changeReviewRef = resolveChangeReviewRef(request.inputPayload, request.runId);
    return {
      status: 'completed',
      externalSessionRef: changeReviewRef,
      result: {
        artifacts: [
          {
            artifactType: 'ActionReceipt',
            state: 'validated',
            payload: {
              connectorKey: 'source_control',
              capabilityId: action.capabilityId,
              sideEffectClass: action.sideEffectClass,
              executionMode: action.executionMode,
              externalRef: changeReviewRef,
              summary: 'Change review upserted successfully.',
              result: {
                changeReviewRef,
              },
            },
          },
        ],
      },
    };
  },
};
