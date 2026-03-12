import type { ConnectorAdapter } from '@baseinterface/connector-sdk';

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
  invoke: async ({ request }) => ({
    status: 'accepted',
    externalSessionRef: `pipeline:${request.runId}:${request.nodeRunId}`,
    metadata: {
      pipelineRef: `pipeline:${request.runId}`,
    },
  }),
  parseActionCallback: ({ body }) => {
    const eventId = typeof body.eventId === 'string' ? body.eventId : `callback-${Date.now()}`;
    const sequence = asNumber(body.sequence, 1);
    const status = typeof body.status === 'string' ? body.status : 'passed';
    return {
      receiptKey: `ci-action:${eventId}`,
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
