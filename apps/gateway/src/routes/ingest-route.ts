import type { Express } from 'express';

import type {
  IngestAck,
  InteractionEvent,
  RoutingDecision,
  UnifiedUserInput,
  UserInteraction,
} from '@baseinterface/contracts';

import {
  FALLBACK_PROVIDER_ID,
  ROUTE_THRESHOLD,
  STICKY_DEFAULT_BOOST,
} from '../gateway-config';
import {
  buildContextPackage,
  buildFallbackReply,
  scoreCandidates,
  updateStickySignals,
  updateTopicDrift,
} from '../gateway-routing';
import type { GatewayServiceBundle } from '../gateway-services';
import type { ProviderRegistryEntry, RawBodyRequest } from '../gateway-types';

export function registerIngestRoute(
  app: Express,
  services: GatewayServiceBundle,
  providerRegistry: Map<string, ProviderRegistryEntry>,
  emitProviderEvents: (
    session: Awaited<ReturnType<GatewayServiceBundle['sessionService']['getOrCreateSession']>>['session'],
    input: UnifiedUserInput,
    providerId: string,
    runId: string,
    events: InteractionEvent[],
  ) => Promise<void>,
): void {
  app.post('/v0/ingest', async (req: RawBodyRequest, res) => {
    const input = req.body as UnifiedUserInput;

    if (!input || input.schemaVersion !== 'v0' || !input.traceId || !input.userId || !input.sessionId) {
      res.status(400).json({
        schemaVersion: 'v0',
        type: 'https://uniassist/errors/invalid_request',
        title: 'Invalid request',
        status: 400,
        code: 'INVALID_REQUEST',
        detail: 'schemaVersion/traceId/userId/sessionId are required',
      });
      return;
    }

    if (input.source !== 'app') {
      const authorized = await services.authGuards.guardInternalAuth(req, res, {
        endpoint: '/v0/ingest',
        expectedAudience: services.internalAuthServiceId,
        allowedSubjects: ['adapter-wechat'],
        traceId: input.traceId,
      });
      if (!authorized) return;

      const signed = services.authGuards.requireExternalSignature(req);
      if (!signed.ok) {
        res.status(401).json({
          schemaVersion: 'v0',
          type: 'https://uniassist/errors/unauthorized',
          title: 'Unauthorized',
          status: 401,
          code: 'INVALID_SIGNATURE',
          detail: signed.message,
          traceId: input.traceId,
        });
        return;
      }
    }

    const { session, rotated } = await services.sessionService.getOrCreateSession({
      ...input,
      timestampMs: input.timestampMs || services.now(),
    });

    const effectiveInput: UnifiedUserInput = {
      ...input,
      sessionId: session.sessionId,
      timestampMs: input.timestampMs || services.now(),
    };

    await services.taskThreadService.ensureTaskThreadsLoaded(session.sessionId);
    services.timelineService.emitEvent(session, effectiveInput, 'inbound', { input: effectiveInput });

    const pendingThreads = services.taskThreadService.listPendingTaskThreads(session.sessionId);
    if (pendingThreads.length > 0 && effectiveInput.text?.trim()) {
      const contextPackage = buildContextPackage(effectiveInput, session);

      if (pendingThreads.length === 1) {
        const thread = pendingThreads[0];
        const provider = services.providerClient.getProviderEntry(thread.providerId);
        const routing: RoutingDecision = {
          schemaVersion: 'v0',
          traceId: effectiveInput.traceId,
          sessionId: session.sessionId,
          candidates: [
            {
              providerId: thread.providerId,
              score: 1,
              reason: 'pending_task_reply',
              requiresClarification: false,
              suggestedMode: 'async',
            },
          ],
          requiresUserConfirmation: false,
          fallback: 'none',
          timestampMs: services.now(),
        };
        services.timelineService.emitEvent(session, effectiveInput, 'routing_decision', routing as unknown as Record<string, unknown>);

        const runId = thread.runId;
        services.timelineService.emitEvent(session, effectiveInput, 'provider_run', {
          providerId: thread.providerId,
          mode: 'async',
          score: 1,
          status: 'in-progress',
          routing_mode: 'normal',
          idempotency_key: `${effectiveInput.traceId}:${thread.providerId}:pending`,
          context: contextPackage,
        }, thread.providerId, runId);

        const forwarded: UserInteraction = {
          schemaVersion: 'v0',
          traceId: effectiveInput.traceId,
          sessionId: session.sessionId,
          userId: effectiveInput.userId,
          providerId: thread.providerId,
          runId,
          actionId: 'answer_task_question',
          replyToken: thread.activeReplyToken,
          inReplyTo: {
            providerId: thread.providerId,
            runId: thread.runId,
            taskId: thread.taskId,
            questionId: thread.activeQuestionId,
          },
          payload: {
            text: effectiveInput.text,
          },
          timestampMs: services.now(),
        };
        services.timelineService.emitEvent(
          session,
          effectiveInput,
          'user_interaction',
          forwarded as unknown as Record<string, unknown>,
          thread.providerId,
          runId,
        );

        if (provider && provider.enabled && provider.baseUrl) {
          const providerEvents = await services.providerClient.interactProvider(provider, forwarded, contextPackage);
          await emitProviderEvents(session, effectiveInput, thread.providerId, runId, providerEvents);
        } else {
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
          services.timelineService.emitEvent(session, effectiveInput, 'interaction', {
            event: {
              type: 'error',
              userMessage: `${thread.providerId} 未注册，无法继续该任务。`,
              retryable: false,
            },
            source: 'system',
          }, thread.providerId, runId);
        }

        services.sessionService.persistSessionAsync(session);
        res.json({
          schemaVersion: 'v0',
          traceId: effectiveInput.traceId,
          sessionId: session.sessionId,
          userId: effectiveInput.userId,
          routing,
          runs: [{ providerId: thread.providerId, runId, mode: 'async' }],
          ackEvents: [{ type: 'ack', message: `已将你的回复转发到 ${thread.providerId} 任务。` }],
          stream: {
            type: 'sse',
            href: `/v0/stream?sessionId=${encodeURIComponent(session.sessionId)}&cursor=${session.seq}`,
            cursor: session.seq,
          },
          timestampMs: services.now(),
        } satisfies IngestAck);
        return;
      }

      const routing: RoutingDecision = {
        schemaVersion: 'v0',
        traceId: effectiveInput.traceId,
        sessionId: session.sessionId,
        candidates: pendingThreads.map((thread) => ({
          providerId: thread.providerId,
          score: 1,
          reason: `pending_task:${thread.taskId}`,
          requiresClarification: true,
          suggestedMode: 'async',
        })),
        requiresUserConfirmation: true,
        fallback: 'none',
        timestampMs: services.now(),
      };
      services.timelineService.emitEvent(session, effectiveInput, 'routing_decision', routing as unknown as Record<string, unknown>);
      services.timelineService.emitEvent(session, effectiveInput, 'interaction', {
        event: services.taskThreadService.buildPendingTaskSelectionCard(pendingThreads),
        source: 'system',
      });
      services.sessionService.persistSessionAsync(session);
      res.json({
        schemaVersion: 'v0',
        traceId: effectiveInput.traceId,
        sessionId: session.sessionId,
        userId: effectiveInput.userId,
        routing,
        runs: [],
        ackEvents: [{ type: 'ack', message: '当前存在多个待处理任务，请先选择要继续的任务。' }],
        stream: {
          type: 'sse',
          href: `/v0/stream?sessionId=${encodeURIComponent(session.sessionId)}&cursor=${session.seq}`,
          cursor: session.seq,
        },
        timestampMs: services.now(),
      } satisfies IngestAck);
      return;
    }

    const topicDriftSuggested = updateTopicDrift(session, effectiveInput);
    const candidates = scoreCandidates(session, effectiveInput, providerRegistry);
    const stickySignal = updateStickySignals(session, candidates);

    const selected = candidates.filter((candidate) => candidate.score >= ROUTE_THRESHOLD).slice(0, 2);
    const requiresConfirmation = selected.length > 1 && selected[0].score - selected[1].score < 0.1;

    if (selected.length > 0 && !session.stickyProviderId) {
      session.stickyProviderId = selected[0].providerId;
      session.stickyScoreBoost = STICKY_DEFAULT_BOOST;
      session.lastSwitchTs = services.now();
    }

    const routing: RoutingDecision = {
      schemaVersion: 'v0',
      traceId: effectiveInput.traceId,
      sessionId: session.sessionId,
      candidates,
      requiresUserConfirmation: requiresConfirmation,
      fallback: selected.length === 0 ? 'builtin_chat' : 'none',
      timestampMs: services.now(),
    };

    services.timelineService.emitEvent(session, effectiveInput, 'routing_decision', routing as unknown as Record<string, unknown>);

    const runs: IngestAck['runs'] = [];
    const ackEvents: InteractionEvent[] = [];
    const contextPackage = buildContextPackage(effectiveInput, session);

    if (rotated) {
      ackEvents.push({
        type: 'ack',
        message: '由于会话长期闲置，已自动创建新会话继续处理。',
      });
    }

    if (selected.length === 0) {
      const runId = services.uuid();
      runs.push({ providerId: FALLBACK_PROVIDER_ID, runId, mode: 'async' });

      services.timelineService.emitEvent(session, effectiveInput, 'provider_run', {
        providerId: FALLBACK_PROVIDER_ID,
        mode: 'async',
        status: 'in-progress',
        routing_mode: 'fallback',
        idempotency_key: `${effectiveInput.traceId}:${FALLBACK_PROVIDER_ID}`,
        context: contextPackage,
      }, FALLBACK_PROVIDER_ID, runId);

      ackEvents.push({
        type: 'ack',
        message: '未命中专项能力，已自动进入通用助手。',
      });

      const fallbackReply: InteractionEvent = {
        type: 'assistant_message',
        text: buildFallbackReply(effectiveInput),
      };

      services.timelineService.emitEvent(session, effectiveInput, 'interaction', {
        event: fallbackReply,
        source: 'fallback',
      }, FALLBACK_PROVIDER_ID, runId);
    } else {
      for (const candidate of selected) {
        const runId = services.uuid();
        runs.push({ providerId: candidate.providerId, runId, mode: 'async' });

        services.timelineService.emitEvent(session, effectiveInput, 'provider_run', {
          providerId: candidate.providerId,
          mode: 'async',
          score: candidate.score,
          status: 'in-progress',
          routing_mode: 'normal',
          idempotency_key: `${effectiveInput.traceId}:${candidate.providerId}`,
          context: contextPackage,
        }, candidate.providerId, runId);

        ackEvents.push({
          type: 'ack',
          message: `已分发到 ${candidate.providerId} 专项处理。`,
        });

        const provider = services.providerClient.getProviderEntry(candidate.providerId);
        if (!provider || !provider.enabled || !provider.baseUrl) {
          const msg: InteractionEvent = {
            type: 'assistant_message',
            text: `${candidate.providerId} 专项未注册，入口将先行承接。`,
          };
          services.timelineService.emitEvent(session, effectiveInput, 'interaction', { event: msg, source: 'system' }, candidate.providerId, runId);
          continue;
        }

        void (async () => {
          const providerEvents = await services.providerClient.invokeProvider(provider, effectiveInput, contextPackage, runId);
          await emitProviderEvents(session, effectiveInput, candidate.providerId, runId, providerEvents);
        })();
      }
    }

    if (topicDriftSuggested) {
      const driftHint: InteractionEvent = {
        type: 'card',
        title: '检测到话题变化较大',
        body: '建议新建会话保持上下文清晰。',
        actions: [{ actionId: 'new_session:auto', label: '新建会话', style: 'secondary' }],
      };
      services.timelineService.emitEvent(session, effectiveInput, 'interaction', { event: driftHint, source: 'system' });
    }

    if (stickySignal.suggestSwitchTo) {
      const switchHint: InteractionEvent = {
        type: 'card',
        title: `建议切换到 ${stickySignal.suggestSwitchTo}`,
        body: '检测到当前输入更匹配另一个专项能力。',
        actions: [{ actionId: `switch_provider:${stickySignal.suggestSwitchTo}`, label: '切换', style: 'primary' }],
      };
      services.timelineService.emitEvent(session, effectiveInput, 'interaction', { event: switchHint, source: 'system' });
    }

    const ack: IngestAck = {
      schemaVersion: 'v0',
      traceId: effectiveInput.traceId,
      sessionId: session.sessionId,
      userId: effectiveInput.userId,
      routing,
      runs,
      ackEvents,
      stream: {
        type: 'sse',
        href: `/v0/stream?sessionId=${encodeURIComponent(session.sessionId)}&cursor=${session.seq}`,
        cursor: session.seq,
      },
      timestampMs: services.now(),
    };

    services.sessionService.persistSessionAsync(session);
    res.json(ack);
  });
}
