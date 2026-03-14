import type { Express } from 'express';

import type { InteractionEvent, UnifiedUserInput, UserInteraction } from '@baseinterface/contracts';

import { BUILDER_PROVIDER_ID } from '../gateway-builder-client';
import { buildBuilderProjectionEvents } from '../gateway-builder-events';
import { STICKY_DEFAULT_BOOST } from '../gateway-config';
import { buildContextPackage } from '../gateway-routing';
import type { GatewayServiceBundle } from '../gateway-services';
import { translateWorkflowFormalEvents } from '../gateway-workflow-events';
import type { TaskThreadState } from '../gateway-types';

function isWorkflowThread(metadata: Record<string, unknown> | undefined): boolean {
  return metadata?.origin === 'workflow';
}

function isWorkflowAction(actionId: string): boolean {
  return actionId.startsWith('approve_request:') || actionId.startsWith('reject_request:');
}

function isBuilderAction(actionId: string): boolean {
  return actionId.startsWith('builder_focus:')
    || actionId.startsWith('builder_synthesize:')
    || actionId.startsWith('builder_validate:')
    || actionId.startsWith('builder_publish:');
}

export function registerInteractRoute(
  app: Express,
  services: GatewayServiceBundle,
  emitProviderEvents: (
    session: Awaited<ReturnType<GatewayServiceBundle['sessionService']['getOrCreateSession']>>['session'],
    input: UnifiedUserInput,
    providerId: string,
    runId: string,
    events: InteractionEvent[],
  ) => Promise<void>,
): void {
  app.post('/v0/interact', async (req, res) => {
    const requestInteraction = req.body as UserInteraction;
    if (!requestInteraction || requestInteraction.schemaVersion !== 'v0') {
      res.status(400).json({ accepted: false, reason: 'invalid interaction' });
      return;
    }

    let session = await services.sessionService.loadSession(requestInteraction.sessionId);
    if (!session) {
      res.status(404).json({ accepted: false, reason: 'session not found' });
      return;
    }

    const inputRef: UnifiedUserInput = {
      schemaVersion: 'v0',
      traceId: requestInteraction.traceId,
      userId: requestInteraction.userId,
      sessionId: requestInteraction.sessionId,
      source: 'app',
      timestampMs: services.now(),
    };

    await services.taskThreadService.ensureTaskThreadsLoaded(session.sessionId);
    let interaction: UserInteraction = { ...requestInteraction };

    services.timelineService.emitEvent(
      session,
      inputRef,
      'user_interaction',
      interaction as unknown as Record<string, unknown>,
      interaction.providerId,
      interaction.runId,
    );

    if (interaction.actionId.startsWith('switch_provider:')) {
      const nextProvider = interaction.actionId.replace('switch_provider:', '');
      session.stickyProviderId = nextProvider;
      session.stickyScoreBoost = STICKY_DEFAULT_BOOST;
      session.lastSwitchTs = services.now();
      session.switchLeadProviderId = undefined;
      session.switchLeadStreak = 0;

      const switched = {
        type: 'assistant_message' as const,
        text: `已切换到 ${nextProvider} 专项。后续将优先按该专项处理。`,
      };

      services.timelineService.emitEvent(session, inputRef, 'interaction', { event: switched, source: 'system' }, nextProvider, interaction.runId);
    }

    if (interaction.actionId.startsWith('new_session:')) {
      const newSessionId = services.uuid();
      const next = {
        sessionId: newSessionId,
        userId: interaction.userId,
        seq: 0,
        lastActivityAt: services.now(),
        topicDriftStreak: 0,
        stickyScoreBoost: STICKY_DEFAULT_BOOST,
        switchLeadStreak: 0,
      };
      session = services.sessionService.ensureSession(next);
      services.sessionService.persistSessionAsync(session);

      res.json({ accepted: true, newSessionId });
      return;
    }

    if (interaction.actionId.startsWith('focus_task:')) {
      const taskId = interaction.actionId.replace('focus_task:', '');
      const thread = services.taskThreadService.getTaskMap(session.sessionId).get(taskId);
      if (!thread) {
        res.status(404).json({ accepted: false, reason: 'task not found' });
        return;
      }
      services.timelineService.emitEvent(session, inputRef, 'interaction', {
        event: {
          type: 'assistant_message',
          text: `已聚焦任务 ${taskId}（${thread.providerId}），你可直接继续回复。`,
        },
        source: 'system',
      }, thread.providerId, thread.runId);
      res.json({
        accepted: true,
        focusedTask: {
          taskId: thread.taskId,
          providerId: thread.providerId,
          runId: thread.runId,
          replyToken: thread.activeReplyToken,
        },
      });
      return;
    }

    if (isBuilderAction(interaction.actionId)) {
      const draftId = interaction.actionId.split(':')[1];
      if (!draftId) {
        res.status(400).json({ accepted: false, reason: 'builder draftId required' });
        return;
      }

      try {
        const builderResponse = interaction.actionId.startsWith('builder_focus:')
          ? await services.builderClient.focusDraft(draftId, {
            schemaVersion: 'v1',
            sessionId: interaction.sessionId,
            userId: interaction.userId,
          })
          : interaction.actionId.startsWith('builder_synthesize:')
            ? await services.builderClient.synthesizeDraft(draftId, {
              schemaVersion: 'v1',
              sessionId: interaction.sessionId,
              userId: interaction.userId,
            })
            : interaction.actionId.startsWith('builder_validate:')
              ? await services.builderClient.validateDraft(draftId, {
                schemaVersion: 'v1',
                sessionId: interaction.sessionId,
                userId: interaction.userId,
              })
              : await services.builderClient.publishDraft(draftId, {
                schemaVersion: 'v1',
                sessionId: interaction.sessionId,
                userId: interaction.userId,
              });

        const events = buildBuilderProjectionEvents(
          builderResponse,
          interaction.actionId.startsWith('builder_focus:')
            ? '已切换当前 Builder 草稿。'
            : interaction.actionId.startsWith('builder_synthesize:')
              ? '已完成 Builder 草稿合成。'
              : interaction.actionId.startsWith('builder_validate:')
                ? '已完成 Builder 草稿校验。'
                : '已完成 Builder 草稿发布。',
        );

        for (const event of events) {
          services.timelineService.emitEvent(
            session,
            inputRef,
            'interaction',
            { event, source: 'system' },
            BUILDER_PROVIDER_ID,
            builderResponse.draft.draftId,
          );
        }
      } catch (error) {
        services.logger.warn('builder interact failed', {
          actionId: interaction.actionId,
          sessionId: interaction.sessionId,
          error: services.serializeError(error),
        });
        services.timelineService.emitEvent(session, inputRef, 'interaction', {
          event: {
            type: 'error',
            userMessage: 'Builder 草稿暂时无法处理当前动作。',
            retryable: true,
          },
          source: 'system',
        }, BUILDER_PROVIDER_ID, draftId);
      }

      services.sessionService.persistSessionAsync(session);
      res.json({ accepted: true });
      return;
    }

    const taskMap = services.taskThreadService.getTaskMap(session.sessionId);
    let thread: TaskThreadState | undefined;

    if (interaction.replyToken) {
      thread = services.taskThreadService.findTaskThreadByReplyToken(session.sessionId, interaction.replyToken);
    }

    if (!thread && interaction.inReplyTo?.taskId) {
      thread = taskMap.get(interaction.inReplyTo.taskId);
    }

    if (!thread && interaction.actionId.startsWith('execute_task:')) {
      const taskId = interaction.actionId.replace('execute_task:', '');
      thread = taskMap.get(taskId);
    }

    if (
      !thread
      && (
        interaction.actionId.startsWith('submit_data_collection')
        || interaction.actionId.startsWith('answer_task_question')
        || interaction.actionId.startsWith('execute_task')
      )
    ) {
      const pending = services.taskThreadService.listPendingTaskThreads(session.sessionId);
      if (pending.length === 1) {
        [thread] = pending;
      } else if (pending.length > 1) {
        services.timelineService.emitEvent(session, inputRef, 'interaction', {
          event: services.taskThreadService.buildPendingTaskSelectionCard(pending),
          source: 'system',
        });
        services.sessionService.persistSessionAsync(session);
        res.json({ accepted: true, reason: 'multiple_pending_tasks' });
        return;
      }
    }

    if (thread) {
      interaction = {
        ...interaction,
        providerId: thread.providerId,
        runId: thread.runId,
        replyToken: interaction.replyToken || thread.activeReplyToken,
        inReplyTo: {
          providerId: thread.providerId,
          runId: thread.runId,
          taskId: thread.taskId,
          questionId: thread.activeQuestionId,
        },
      };
    }

    const useWorkflowPath = Boolean(
      (thread && isWorkflowThread(thread.metadata))
      || isWorkflowAction(interaction.actionId),
    );

    if (useWorkflowPath) {
      if (!interaction.runId) {
        res.status(400).json({ accepted: false, reason: 'workflow runId required' });
        return;
      }

      try {
        const workflowResponse = await services.workflowClient.resumeWorkflowRun({
          traceId: interaction.traceId,
          sessionId: interaction.sessionId,
          userId: interaction.userId,
          runId: interaction.runId,
          actionId: interaction.actionId,
          replyToken: interaction.replyToken,
          taskId: interaction.inReplyTo?.taskId,
          payload: interaction.payload,
        });
        const translated = translateWorkflowFormalEvents(
          interaction.providerId,
          workflowResponse.run.run.runId,
          workflowResponse.events,
        );
        await emitProviderEvents(
          session,
          inputRef,
          interaction.providerId,
          workflowResponse.run.run.runId,
          translated,
        );
      } catch (error) {
        services.logger.warn('workflow interact failed', {
          providerId: interaction.providerId,
          runId: interaction.runId,
          actionId: interaction.actionId,
          error: services.serializeError(error),
        });
        if (thread) {
          services.taskThreadService.updateTaskThread(session.sessionId, {
            ...thread,
            state: 'failed',
            activeQuestionId: undefined,
            activeReplyToken: undefined,
            metadata: {
              ...(thread.metadata || {}),
              reason: 'workflow_interact_failed',
            },
            updatedAt: services.now(),
          });
        }
        services.timelineService.emitEvent(session, inputRef, 'interaction', {
          event: {
            type: 'error',
            userMessage: `${interaction.providerId} workflow 暂时无法处理当前动作。`,
            retryable: true,
          },
          source: 'system',
        }, interaction.providerId, interaction.runId);
      }

      services.sessionService.persistSessionAsync(session);
      res.json({ accepted: true });
      return;
    }

    if (
      interaction.actionId.startsWith('submit_data_collection')
      || interaction.actionId.startsWith('answer_task_question')
      || interaction.actionId.startsWith('execute_task')
    ) {
      const contextPackage = buildContextPackage(inputRef, session);
      const provider = services.providerClient.getProviderEntry(interaction.providerId);

      if (provider && provider.enabled && provider.baseUrl) {
        const providerEvents = await services.providerClient.interactProvider(provider, interaction, contextPackage);
        await emitProviderEvents(session, inputRef, interaction.providerId, interaction.runId, providerEvents);
      } else {
        if (thread) {
          services.taskThreadService.updateTaskThread(session.sessionId, {
            ...thread,
            state: 'failed',
            activeQuestionId: undefined,
            activeReplyToken: undefined,
            metadata: {
              ...(thread.metadata || {}),
              reason: 'provider_unavailable_or_unregistered',
            },
            updatedAt: services.now(),
          });
        }
        services.timelineService.emitEvent(session, inputRef, 'interaction', {
          event: {
            type: 'error',
            userMessage: `${interaction.providerId} 未注册，无法处理当前动作。`,
            retryable: false,
          },
          source: 'system',
        }, interaction.providerId, interaction.runId);
      }
    }

    services.sessionService.persistSessionAsync(session);
    res.json({ accepted: true });
  });
}
