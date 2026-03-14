import type { ConnectorAdapter } from '@uniassist/connector-sdk';

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

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

function resolvePipelineRef(inputPayload: Record<string, unknown> | undefined, runId: string): string {
  for (const candidate of buildInputCandidates(inputPayload)) {
    if (typeof candidate.pipelineRef === 'string' && candidate.pipelineRef) {
      return candidate.pipelineRef;
    }
    const targets = isRecord(candidate.targets) ? candidate.targets : undefined;
    if (typeof targets?.pipelineRef === 'string' && targets.pipelineRef) {
      return targets.pipelineRef;
    }
  }
  return `pipeline:${runId}`;
}

export const ciPipelineSampleConnector: ConnectorAdapter = {
  connectorKey: 'ci_pipeline',
  catalog: {
    actions: [
      {
        capabilityId: 'pipeline.start',
        name: 'Start Pipeline',
        description: 'Start an asynchronous CI pipeline.',
        executionMode: 'async',
        sideEffectClass: 'write',
        supportsBrowserFallback: false,
      },
    ],
    events: [
      {
        eventType: 'pipeline.finished',
        description: 'Pipeline finished webhook.',
        deliveryMode: 'webhook',
      },
    ],
  },
  invoke: async ({ request }) => {
    const pipelineRef = resolvePipelineRef(request.inputPayload, request.runId);
    return {
      status: 'accepted',
      externalSessionRef: pipelineRef,
      metadata: {
        pipelineRef,
      },
    };
  },
  parseActionCallback: ({ body }) => {
    const eventId = typeof body.eventId === 'string' ? body.eventId : `callback-${Date.now()}`;
    const receiptKey = typeof body.receiptKey === 'string' && body.receiptKey
      ? body.receiptKey
      : `ci-action:${eventId}`;
    const sequence = asNumber(body.sequence, 1);
    const status = typeof body.status === 'string' ? body.status : 'passed';
    return {
      receiptKey,
      callbackId: eventId,
      sequence,
      externalSessionRef: typeof body.externalSessionRef === 'string' ? body.externalSessionRef : 'pipeline:unknown',
      kind: status === 'failed' ? 'error' : 'result',
      emittedAt: asNumber(body.emittedAt, Date.now()),
      payload: status === 'failed'
        ? {
            message: typeof body.summary === 'string' ? body.summary : 'Pipeline execution failed.',
            code: 'PIPELINE_FAILED',
          }
        : {
            artifacts: [
              {
                artifactType: 'ValidationReport',
                state: 'validated',
                payload: {
                  pipelineRef: typeof body.pipelineRef === 'string' ? body.pipelineRef : 'pipeline:unknown',
                  status: 'passed',
                  summary: typeof body.summary === 'string' ? body.summary : 'Pipeline completed successfully.',
                  details: typeof body.details === 'object' && body.details ? body.details : {},
                },
              },
            ],
          },
    };
  },
  parseEvent: ({ body }) => {
    const eventId = typeof body.eventId === 'string' ? body.eventId : `event-${Date.now()}`;
    return {
      receiptKey: `ci-event:${eventId}`,
      firedAt: asNumber(body.emittedAt, Date.now()),
      payload: {
        eventId,
        pipelineRef: typeof body.pipelineRef === 'string' ? body.pipelineRef : 'pipeline:unknown',
        status: typeof body.status === 'string' ? body.status : 'passed',
      },
    };
  },
};
