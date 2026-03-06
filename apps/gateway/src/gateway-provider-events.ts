import type { InteractionEvent, UnifiedUserInput, UserInteraction } from '@baseinterface/contracts';

import { buildContextPackage } from './gateway-routing';
import type { GatewayServiceBundle } from './gateway-services';
import type { SessionState } from './gateway-types';

export function createEmitProviderEvents(services: GatewayServiceBundle) {
  return async function emitProviderEvents(
    session: SessionState,
    input: UnifiedUserInput,
    providerId: string,
    runId: string,
    events: InteractionEvent[],
  ): Promise<void> {
    for (const event of events) {
      const normalized = services.taskThreadService.normalizeProviderInteractionEvent(providerId, runId, event);
      services.timelineService.emitEvent(session, input, 'interaction', {
        event: normalized,
        source: 'provider',
      }, providerId, runId);

      if (normalized.type !== 'provider_extension') continue;
      if (normalized.extensionKind === 'task_question') {
        services.taskThreadService.updateTaskThread(session.sessionId, {
          taskId: normalized.payload.taskId,
          sessionId: session.sessionId,
          providerId: normalized.payload.providerId,
          runId: normalized.payload.runId,
          state: 'collecting',
          executionPolicy: 'require_user_confirm',
          activeQuestionId: normalized.payload.questionId,
          activeReplyToken: normalized.payload.replyToken,
          metadata: normalized.payload.metadata,
          updatedAt: services.now(),
        });
      }

      if (normalized.extensionKind === 'task_state') {
        const active = services.taskThreadService.getTaskMap(session.sessionId).get(normalized.payload.taskId);
        const thread = services.taskThreadService.updateTaskThread(session.sessionId, {
          taskId: normalized.payload.taskId,
          sessionId: session.sessionId,
          providerId: normalized.payload.providerId,
          runId: normalized.payload.runId,
          state: normalized.payload.state,
          executionPolicy: normalized.payload.executionPolicy,
          activeQuestionId: normalized.payload.state === 'collecting' ? active?.activeQuestionId : undefined,
          activeReplyToken: normalized.payload.state === 'collecting' ? active?.activeReplyToken : undefined,
          metadata: normalized.payload.metadata,
          updatedAt: services.now(),
        });

        if (thread.state === 'ready') {
          if (thread.executionPolicy === 'auto_execute') {
            const provider = services.providerClient.getProviderEntry(thread.providerId);
            if (provider) {
              const executeInteraction: UserInteraction = {
                schemaVersion: 'v0',
                traceId: services.uuid(),
                sessionId: session.sessionId,
                userId: input.userId,
                providerId: thread.providerId,
                runId: thread.runId,
                actionId: 'execute_task',
                payload: { taskId: thread.taskId },
                inReplyTo: {
                  providerId: thread.providerId,
                  runId: thread.runId,
                  taskId: thread.taskId,
                },
                timestampMs: services.now(),
              };
              const context = buildContextPackage(input, session);
              const executeEvents = await services.providerClient.interactProvider(provider, executeInteraction, context);
              await emitProviderEvents(session, input, thread.providerId, thread.runId, executeEvents);
            }
          } else {
            services.timelineService.emitEvent(session, input, 'interaction', {
              event: services.taskThreadService.buildTaskExecutionConfirmCard(thread),
              source: 'system',
            }, thread.providerId, thread.runId);
          }
        }
      }
    }
  };
}
