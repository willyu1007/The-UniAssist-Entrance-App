import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IngestAck, InteractionEvent, TimelineEvent, UnifiedUserInput, UserInteraction } from '@baseinterface/contracts';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { TimelineTransport, type TimelineTransportMode, type TimelineTransportState } from '@/transport/timelineTransport';
import { GATEWAY_BASE_URL } from './constants';
import { makeId, parseInteractionFromPayload, sourceLabel } from './helpers';
import { simulateLocalFlow } from './localFlow';
import { useHomeUiHandlers } from './useHomeUiHandlers';
import { useHomeVoiceHandlers } from './useHomeVoiceHandlers';
import type { FocusedTaskResponse, ChatItem, SwitchSuggestion, TaskThreadView } from './types';

export function useHomeController() {
  const voice = useVoiceRecorder();
  const userId = useMemo(() => 'app:user-demo', []);
  const [selectedFeature, setSelectedFeature] = useState('chat');
  const [items, setItems] = useState<ChatItem[]>([]);
  const [sessionId, setSessionId] = useState(() => makeId('session'));
  const [cursor, setCursor] = useState(0);
  const [attachmentVisible, setAttachmentVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [switchSuggestion, setSwitchSuggestion] = useState<SwitchSuggestion | null>(null);
  const [transportMode, setTransportMode] = useState<TimelineTransportMode>('idle');
  const [transportState, setTransportState] = useState<TimelineTransportState>('closed');
  const [taskThreads, setTaskThreads] = useState<Record<string, TaskThreadView>>({});
  const [activeTask, setActiveTask] = useState<TaskThreadView | null>(null);
  const [pendingReplyDraft, setPendingReplyDraft] = useState<string | null>(null);
  const [pendingTaskPickerVisible, setPendingTaskPickerVisible] = useState(false);
  const seenEventIds = useRef<Set<string>>(new Set());
  const transportRef = useRef<TimelineTransport | null>(null);
  const pendingTasks = useMemo(
    () => Object.values(taskThreads).filter((thread) => thread.state === 'collecting' && Boolean(thread.replyToken)),
    [taskThreads],
  );

  const appendTextItem = useCallback((role: ChatItem['role'], text: string, label?: string, providerId?: string, runId?: string) => {
    setItems((prev) => [
      ...prev,
      {
        id: makeId('bubble'),
        role,
        text,
        sourceLabel: label,
        providerId,
        runId,
      },
    ]);
  }, []);
  const upsertTaskQuestion = useCallback((task: TaskThreadView) => {
    setTaskThreads((prev) => ({
      ...prev,
      [task.taskId]: task,
    }));
    setActiveTask((prev) => {
      if (!prev) return task;
      if (prev.taskId === task.taskId) return task;
      return prev;
    });
  }, []);

  const upsertTaskState = useCallback((task: TaskThreadView) => {
    setTaskThreads((prev) => {
      const existing = prev[task.taskId];
      const merged: TaskThreadView = {
        ...(existing || task),
        ...task,
        questionId: task.state === 'collecting' ? (task.questionId || existing?.questionId) : undefined,
        replyToken: task.state === 'collecting' ? (task.replyToken || existing?.replyToken) : undefined,
        prompt: task.prompt || existing?.prompt,
      };
      return {
        ...prev,
        [task.taskId]: merged,
      };
    });

    setActiveTask((prev) => {
      if (!prev || prev.taskId !== task.taskId) return prev;
      const merged: TaskThreadView = {
        ...prev,
        ...task,
        questionId: task.state === 'collecting' ? (task.questionId || prev.questionId) : undefined,
        replyToken: task.state === 'collecting' ? (task.replyToken || prev.replyToken) : undefined,
        prompt: task.prompt || prev.prompt,
      };
      if (task.state === 'completed' || task.state === 'failed') return null;
      return merged;
    });
  }, []);

  const appendInteractionItem = useCallback((interaction: InteractionEvent, label: string, providerId?: string, runId?: string) => {
    const type = interaction.type;

    if (type === 'assistant_message') {
      appendTextItem('assistant', interaction.text, label, providerId, runId);
      return;
    }

    if (type === 'ack') {
      appendTextItem('system', interaction.message || '请求已接收。', label, providerId, runId);
      return;
    }

    if (type === 'error') {
      appendTextItem('system', interaction.userMessage, label, providerId, runId);
      return;
    }

    if (type === 'card' && interaction.actions) {
      const switchAction = interaction.actions.find((action) => action.actionId.startsWith('switch_provider:'));
      if (switchAction) {
        setSwitchSuggestion({
          actionId: switchAction.actionId,
          providerId: switchAction.actionId.replace('switch_provider:', ''),
          runId,
        });
      }
    }

    if (type === 'provider_extension' && interaction.extensionKind === 'task_question') {
      upsertTaskQuestion({
        taskId: interaction.payload.taskId,
        providerId: interaction.payload.providerId,
        runId: interaction.payload.runId,
        state: 'collecting',
        executionPolicy: 'require_user_confirm',
        questionId: interaction.payload.questionId,
        replyToken: interaction.payload.replyToken,
        prompt: interaction.payload.prompt,
      });
    }

    if (type === 'provider_extension' && interaction.extensionKind === 'task_state') {
      upsertTaskState({
        taskId: interaction.payload.taskId,
        providerId: interaction.payload.providerId,
        runId: interaction.payload.runId,
        state: interaction.payload.state,
        executionPolicy: interaction.payload.executionPolicy,
      });
    }

    setItems((prev) => [
      ...prev,
      {
        id: makeId('bubble'),
        role: 'assistant',
        interaction,
        sourceLabel: label,
        providerId,
        runId,
      },
    ]);
  }, [appendTextItem, upsertTaskQuestion, upsertTaskState]);

  const appendTimelineEvent = useCallback((event: TimelineEvent) => {
    if (seenEventIds.current.has(event.eventId)) return;
    seenEventIds.current.add(event.eventId);

    if (event.kind === 'interaction') {
      const payload = event.payload as Record<string, unknown>;
      const interaction = parseInteractionFromPayload(payload);
      if (!interaction) return;
      appendInteractionItem(interaction, sourceLabel(event, payload), event.providerId, event.runId);
      return;
    }

    if (event.kind === 'domain_event') {
      const payload = event.payload as Record<string, unknown>;
      const wrapped = payload.event as { title?: string; body?: string } | undefined;
      if (!wrapped?.title) return;
      appendTextItem('system', wrapped.body ? `${wrapped.title}\n${wrapped.body}` : wrapped.title, 'domain_event', event.providerId, event.runId);
    }
  }, [appendInteractionItem, appendTextItem]);

  useEffect(() => {
    if (!GATEWAY_BASE_URL) {
      setTransportMode('idle');
      setTransportState('closed');
      return undefined;
    }

    const transport = new TimelineTransport({
      baseUrl: GATEWAY_BASE_URL,
      sessionId,
      initialCursor: 0,
      onEvents: (events) => {
        events.forEach((event) => appendTimelineEvent(event));
      },
      onCursor: (nextCursor) => {
        setCursor(nextCursor);
      },
      onStatus: (state, mode) => {
        setTransportState(state);
        setTransportMode(mode);
      },
    });

    transportRef.current = transport;
    transport.start();

    return () => {
      if (transportRef.current === transport) {
        transportRef.current = null;
      }
      transport.stop();
    };
  }, [appendTimelineEvent, sessionId]);

  const { resetSession, handleLogoPress } = useHomeUiHandlers({
    sessionId,
    setSessionId,
    setCursor,
    setItems,
    setTaskThreads,
    setActiveTask,
    setPendingReplyDraft,
    setPendingTaskPickerVisible,
    seenEventIds,
    setSwitchSuggestion,
    setToastMessage,
  });

  const postInteraction = useCallback(async (payload: {
    actionId: string;
    providerId: string;
    runId?: string;
    data?: Record<string, unknown>;
    replyToken?: string;
    inReplyTo?: UserInteraction['inReplyTo'];
  }): Promise<FocusedTaskResponse | null> => {
    if (!GATEWAY_BASE_URL) {
      appendTextItem('system', `本地模式已处理动作：${payload.actionId}`, 'local');
      return { accepted: true };
    }

    const interaction: UserInteraction = {
      schemaVersion: 'v0',
      traceId: makeId('trace'),
      sessionId,
      userId,
      providerId: payload.providerId,
      runId: payload.runId || makeId('run'),
      actionId: payload.actionId,
      payload: payload.data,
      replyToken: payload.replyToken,
      inReplyTo: payload.inReplyTo,
      timestampMs: Date.now(),
    };

    try {
      const response = await fetch(`${GATEWAY_BASE_URL}/v0/interact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(interaction),
      });

      if (!response.ok) {
        appendTextItem('system', `交互回传失败：${response.status}`, 'engine');
        return null;
      }

      const json = (await response.json()) as FocusedTaskResponse;
      if (json.newSessionId) {
        resetSession(json.newSessionId);
        setToastMessage('已创建新会话');
      }

      if (json.focusedTask) {
        const focused: TaskThreadView = {
          taskId: json.focusedTask.taskId,
          providerId: json.focusedTask.providerId,
          runId: json.focusedTask.runId,
          state: 'collecting',
          executionPolicy: 'require_user_confirm',
          replyToken: json.focusedTask.replyToken,
        };
        upsertTaskQuestion(focused);
        setActiveTask(focused);
      }

      if (payload.actionId.startsWith('switch_provider:')) {
        setSwitchSuggestion(null);
      }

      void transportRef.current?.syncNow();
      return json;
    } catch {
      appendTextItem('system', '交互回传异常，请稍后重试', 'engine');
      return null;
    }
  }, [appendTextItem, resetSession, sessionId, upsertTaskQuestion, userId]);

  const runLocalFlow = useCallback((text: string) => {
    simulateLocalFlow(text, appendTextItem, appendInteractionItem);
  }, [appendInteractionItem, appendTextItem]);

  const sendTaskReply = useCallback(async (text: string, task: TaskThreadView) => {
    const trimmed = text.trim();
    const payload: Record<string, unknown> = { text };
    const isDueDateQuestion = String(task.questionId || '').toLowerCase().includes('duedate');
    if (isDueDateQuestion && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      payload.dueDate = trimmed;
    }

    appendTextItem('user', text, 'app');
    await postInteraction({
      actionId: 'answer_task_question',
      providerId: task.providerId,
      runId: task.runId,
      replyToken: task.replyToken,
      inReplyTo: {
        providerId: task.providerId,
        runId: task.runId,
        taskId: task.taskId,
        questionId: task.questionId,
      },
      data: payload,
    });
  }, [appendTextItem, postInteraction]);

  const sendIngestText = useCallback(async (text: string) => {
    appendTextItem('user', text, 'app');

    if (!GATEWAY_BASE_URL) {
      runLocalFlow(text);
      return;
    }

    const input: UnifiedUserInput = {
      schemaVersion: 'v0',
      traceId: makeId('trace'),
      userId,
      sessionId,
      source: 'app',
      text,
      timestampMs: Date.now(),
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
    };

    try {
      const response = await fetch(`${GATEWAY_BASE_URL}/v0/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        appendTextItem('system', `Gateway 调用失败：${response.status}`, 'engine');
        return;
      }

      const ack = (await response.json()) as IngestAck;
      if (ack.sessionId !== sessionId) {
        setSessionId(ack.sessionId);
        setCursor(0);
        seenEventIds.current.clear();
      }

      for (const ackEvent of ack.ackEvents) {
        appendInteractionItem(ackEvent, 'engine', undefined, undefined);
      }

      void transportRef.current?.syncNow();
    } catch {
      appendTextItem('system', '请求失败，请检查 Gateway 连接。', 'engine');
    }
  }, [appendInteractionItem, appendTextItem, runLocalFlow, sessionId, userId]);

  const handlePickPendingTask = useCallback((task: TaskThreadView) => {
    const queuedText = pendingReplyDraft;
    setActiveTask(task);
    setPendingTaskPickerVisible(false);
    setPendingReplyDraft(null);
    void postInteraction({
      actionId: `focus_task:${task.taskId}`,
      providerId: task.providerId,
      runId: task.runId,
    });
    if (queuedText) {
      void sendTaskReply(queuedText, task);
    }
  }, [pendingReplyDraft, postInteraction, sendTaskReply]);

  const handleSend = useCallback(async (text: string) => {
    if (activeTask?.replyToken) {
      await sendTaskReply(text, activeTask);
      return;
    }

    if (pendingTasks.length > 1) {
      setPendingReplyDraft(text);
      setPendingTaskPickerVisible(true);
      setToastMessage('请先选择要继续的任务');
      return;
    }

    if (pendingTasks.length === 1) {
      const pending = pendingTasks[0];
      setActiveTask(pending);
      await sendTaskReply(text, pending);
      return;
    }

    await sendIngestText(text);
  }, [activeTask, pendingTasks, sendIngestText, sendTaskReply]);

  const { handleVoiceStart, handleVoiceSend, handleVoiceCancel } = useHomeVoiceHandlers({
    voice,
    handleSend,
    setToastMessage,
  });

  return {
    selectedFeature,
    setSelectedFeature,
    items,
    attachmentVisible,
    setAttachmentVisible,
    drawerVisible,
    setDrawerVisible,
    toastMessage,
    setToastMessage,
    switchSuggestion,
    transportMode,
    transportState,
    cursor,
    sessionId,
    activeTask,
    setActiveTask,
    pendingTasks,
    pendingReplyDraft,
    pendingTaskPickerVisible,
    setPendingTaskPickerVisible,
    setPendingReplyDraft,
    voice,
    handleSend,
    handleVoiceStart,
    handleVoiceSend,
    handleVoiceCancel,
    handleLogoPress,
    postInteraction,
    resetSession,
    handlePickPendingTask,
  };
}

export type HomeController = ReturnType<typeof useHomeController>;
