import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  IngestAck,
  InteractionEvent,
  TimelineEvent,
  UnifiedUserInput,
  UserInteraction,
} from '@baseinterface/contracts';
import { useThemeTokens } from '@/theme';
import { Text, Toolbar, ToolbarSlot, IconButton } from '@/components/ui';
import { FeaturePicker } from '@/components/FeaturePicker';
import { ChatInput } from '@/components/ChatInput';
import { AttachmentSheet } from '@/components/AttachmentSheet';
import { AppDrawer } from '@/components/AppDrawer';
import { Toast } from '@/components/Toast';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import type { FeatureOption } from '@/components/FeaturePicker';

const logoIcon = require('@/assets/logo-icon.png');

const FEATURES: FeatureOption[] = [
  { key: 'chat', label: '对话' },
  { key: 'write', label: '写作' },
  { key: 'code', label: '编程' },
  { key: 'translate', label: '翻译' },
];

const LOGO_SIZE = 28;
const GATEWAY_BASE_URL = (process.env.EXPO_PUBLIC_GATEWAY_BASE_URL || '').replace(/\/$/, '');

type ChatItem = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text?: string;
  sourceLabel?: string;
  providerId?: string;
  runId?: string;
  interaction?: InteractionEvent;
};

type SwitchSuggestion = {
  actionId: string;
  providerId: string;
  runId?: string;
};

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseInteractionFromPayload(payload: Record<string, unknown>): InteractionEvent | null {
  const maybeEvent = payload.event;
  if (!maybeEvent || typeof maybeEvent !== 'object') return null;
  const casted = maybeEvent as { type?: string };
  if (!casted.type) return null;
  return maybeEvent as InteractionEvent;
}

function sourceLabel(event: TimelineEvent, payload: Record<string, unknown>): string {
  const source = typeof payload.source === 'string' ? payload.source : undefined;
  if (event.providerId && source) return `${event.providerId} · ${source}`;
  if (event.providerId) return event.providerId;
  if (source) return source;
  return 'engine';
}

export default function HomeScreen() {
  const t = useThemeTokens();
  const insets = useSafeAreaInsets();
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

  const seenEventIds = useRef<Set<string>>(new Set());

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
  }, [appendTextItem]);

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

  const pollTimeline = useCallback(async () => {
    if (!GATEWAY_BASE_URL) return;

    try {
      const response = await fetch(
        `${GATEWAY_BASE_URL}/v0/timeline?sessionId=${encodeURIComponent(sessionId)}&cursor=${cursor}`,
      );
      if (!response.ok) return;

      const json = (await response.json()) as { events?: TimelineEvent[]; nextCursor?: number };
      const events = json.events || [];
      events.forEach((event) => appendTimelineEvent(event));
      if (typeof json.nextCursor === 'number') {
        setCursor(json.nextCursor);
      }
    } catch {
      // Keep polling resilient; failures are surfaced by missing new events.
    }
  }, [appendTimelineEvent, cursor, sessionId]);

  useEffect(() => {
    if (!GATEWAY_BASE_URL) return;
    const timer = setInterval(() => {
      void pollTimeline();
    }, 1500);
    return () => clearInterval(timer);
  }, [pollTimeline]);

  const resetSession = useCallback((nextSessionId?: string) => {
    setSessionId(nextSessionId || makeId('session'));
    setCursor(0);
    setItems([]);
    seenEventIds.current.clear();
    setSwitchSuggestion(null);
  }, []);

  const postInteraction = useCallback(async (payload: { actionId: string; providerId: string; runId?: string; data?: Record<string, unknown> }) => {
    if (!GATEWAY_BASE_URL) {
      appendTextItem('system', `本地模式已处理动作：${payload.actionId}`, 'local');
      return;
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
        return;
      }

      const json = (await response.json()) as { accepted?: boolean; newSessionId?: string };
      if (json.newSessionId) {
        resetSession(json.newSessionId);
        setToastMessage('已创建新会话');
      }

      if (payload.actionId.startsWith('switch_provider:')) {
        setSwitchSuggestion(null);
      }

      void pollTimeline();
    } catch {
      appendTextItem('system', '交互回传异常，请稍后重试', 'engine');
    }
  }, [appendTextItem, pollTimeline, resetSession, sessionId, userId]);

  const simulateLocalFlow = useCallback((text: string) => {
    const isPlan = /计划|安排|日程|目标|规划/.test(text);
    const isWork = /工作|任务|项目|会议|汇报|交付/.test(text);

    if (!isPlan && !isWork) {
      appendTextItem('assistant', `未命中专项能力，先由通用助手处理：${text}`, 'builtin_chat · fallback', 'builtin_chat');
      return;
    }

    if (isPlan) {
      const interaction: InteractionEvent = {
        type: 'provider_extension',
        extensionKind: 'data_collection_request',
        payload: {
          schemaVersion: 'v0',
          providerId: 'plan',
          taskId: makeId('run'),
          status: 'pending',
          dataSchema: {
            type: 'object',
            properties: {
              goal: { type: 'string', title: '本次目标' },
              dueDate: { type: 'string', title: '目标日期' },
            },
            required: ['goal'],
          },
          uiSchema: {
            order: ['goal', 'dueDate'],
          },
        },
      };
      appendInteractionItem(interaction, 'plan · local', 'plan', makeId('run'));
    }

    if (isWork) {
      appendTextItem('assistant', 'work 专项已接收任务，正在生成执行建议。', 'work · local', 'work', makeId('run'));
    }
  }, [appendInteractionItem, appendTextItem]);

  const handleSend = useCallback(async (text: string) => {
    appendTextItem('user', text, 'app');

    if (!GATEWAY_BASE_URL) {
      simulateLocalFlow(text);
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

      void pollTimeline();
    } catch {
      appendTextItem('system', '请求失败，请检查 Gateway 连接。', 'engine');
    }
  }, [appendInteractionItem, appendTextItem, pollTimeline, sessionId, simulateLocalFlow, userId]);

  const handleVoiceStart = useCallback(async () => {
    const ok = await voice.start();
    if (!ok) {
      Alert.alert('无法录音', '请在系统设置中允许 MoreThan 访问麦克风');
    }
  }, [voice]);

  const handleVoiceSend = useCallback(async () => {
    const text = await voice.stopAndTranscribe();
    if (text) {
      void handleSend(text);
    } else {
      setToastMessage('未能识别语音内容，请重试');
    }
  }, [voice, handleSend]);

  const handleVoiceCancel = useCallback(() => {
    voice.cancel();
  }, [voice]);

  const handleLogoPress = useCallback(() => {
    setToastMessage(`当前会话：${sessionId}`);
  }, [sessionId]);

  const renderInteractionBody = useCallback((item: ChatItem) => {
    if (!item.interaction) return null;
    const event = item.interaction;

    if (event.type === 'card') {
      return (
        <View>
          <Text variant="label">{event.title}</Text>
          {event.body ? <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>{event.body}</Text> : null}
          {event.actions && event.actions.length > 0 ? (
            <View style={styles.actionRow}>
              {event.actions.map((action) => (
                <Pressable
                  key={action.actionId}
                  onPress={() => {
                    void postInteraction({
                      actionId: action.actionId,
                      providerId: item.providerId || 'builtin_chat',
                      runId: item.runId,
                    });
                  }}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    {
                      backgroundColor: pressed ? t.color.surfaceElevated : t.color.surface,
                      borderColor: t.color.border,
                      borderWidth: t.border.width.sm,
                      borderRadius: t.radius.md,
                    },
                  ]}
                >
                  <Text variant="caption">{action.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      );
    }

    if (event.type === 'request_clarification') {
      return (
        <View>
          <Text variant="label">{event.question}</Text>
          <View style={styles.actionRow}>
            {event.choices.map((choice) => (
              <Pressable
                key={choice.key}
                onPress={() => {
                  void postInteraction({
                    actionId: `clarify:${choice.key}`,
                    providerId: item.providerId || 'builtin_chat',
                    runId: item.runId,
                    data: { choice: choice.key },
                  });
                }}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    backgroundColor: pressed ? t.color.surfaceElevated : t.color.surface,
                    borderColor: t.color.border,
                    borderWidth: t.border.width.sm,
                    borderRadius: t.radius.md,
                  },
                ]}
              >
                <Text variant="caption">{choice.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      );
    }

    if (event.type === 'provider_extension') {
      if (event.extensionKind === 'data_collection_request') {
        const fields = Object.keys((event.payload.dataSchema?.properties || {}) as Record<string, unknown>);
        return (
          <View>
            <Text variant="label">资料收集请求</Text>
            {fields.map((field) => (
              <Text key={field} variant="caption" tone="muted" style={{ marginTop: 2 }}>
                - {field}
              </Text>
            ))}
            <Pressable
              onPress={() => {
                void postInteraction({
                  actionId: 'submit_data_collection',
                  providerId: item.providerId || event.payload.providerId,
                  runId: item.runId,
                  data: {
                    goal: '完成统一入口v0联调',
                    dueDate: '2026-03-01',
                  },
                });
              }}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  marginTop: t.space[2],
                  backgroundColor: pressed ? t.color.primaryActive : t.color.primary,
                  borderRadius: t.radius.md,
                },
              ]}
            >
              <Text variant="caption" style={{ color: t.color.onPrimary }}>提交资料</Text>
            </Pressable>
          </View>
        );
      }

      if (event.extensionKind === 'data_collection_progress') {
        const progress = event.payload.progress;
        return (
          <View>
            <Text variant="label">资料处理中</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
              {progress ? `${progress.step}/${progress.total} ${progress.label || ''}` : '处理中'}
            </Text>
          </View>
        );
      }

      return (
        <View>
          <Text variant="label">资料处理结果</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            {JSON.stringify(event.payload.values || {}, null, 2)}
          </Text>
        </View>
      );
    }

    if (event.type === 'nav') {
      return <Text variant="body">导航：{event.label}</Text>;
    }

    if (event.type === 'form') {
      return <Text variant="body">表单：{event.title || event.formId}</Text>;
    }

    return null;
  }, [postInteraction, t]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: t.color.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Toolbar>
          <ToolbarSlot>
            <IconButton onPress={() => setDrawerVisible(true)}>
              <Ionicons name="menu" size={24} color={t.color.textPrimary} />
            </IconButton>
          </ToolbarSlot>

          <ToolbarSlot>
            <FeaturePicker
              options={FEATURES}
              selectedKey={selectedFeature}
              onSelect={setSelectedFeature}
            />
          </ToolbarSlot>

          <ToolbarSlot>
            <IconButton onPress={handleLogoPress}>
              <Image
                source={logoIcon}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </IconButton>
          </ToolbarSlot>
        </Toolbar>

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.messageList,
            { paddingHorizontal: t.space[4] },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyConversation}>
              <Text variant="body" tone="muted">
                发送消息开始对话（统一入口引擎模式）
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            return (
              <View
                style={[
                  styles.messageBubble,
                  {
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    backgroundColor: isUser ? t.color.primary : t.color.surface,
                    borderColor: isUser ? 'transparent' : t.color.border,
                    borderWidth: isUser ? 0 : t.border.width.sm,
                    borderRadius: t.radius.lg,
                    paddingVertical: t.space[3],
                    paddingHorizontal: t.space[4],
                    marginBottom: t.space[3],
                    maxWidth: '85%',
                  },
                ]}
              >
                {item.sourceLabel ? (
                  <Text
                    variant="caption"
                    style={{
                      marginBottom: 4,
                      color: isUser ? t.color.onPrimary : t.color.textMuted,
                    }}
                  >
                    {item.sourceLabel}
                  </Text>
                ) : null}

                {item.text ? (
                  <Text
                    variant="body"
                    style={{ color: isUser ? t.color.onPrimary : t.color.textPrimary }}
                  >
                    {item.text}
                  </Text>
                ) : null}

                {!item.text && item.interaction ? renderInteractionBody(item) : null}
              </View>
            );
          }}
        />

        {switchSuggestion ? (
          <View
            style={[
              styles.switchChipWrap,
              {
                paddingHorizontal: t.space[4],
                paddingBottom: t.space[2],
              },
            ]}
          >
            <Pressable
              onPress={() => {
                void postInteraction({
                  actionId: switchSuggestion.actionId,
                  providerId: switchSuggestion.providerId,
                  runId: switchSuggestion.runId,
                });
              }}
              style={({ pressed }) => [
                styles.switchChip,
                {
                  borderRadius: t.radius.full,
                  borderColor: t.color.border,
                  borderWidth: t.border.width.sm,
                  backgroundColor: pressed ? t.color.surfaceElevated : t.color.surface,
                },
              ]}
            >
              <Ionicons name="swap-horizontal-outline" size={14} color={t.color.textSecondary} />
              <Text variant="caption" style={{ marginLeft: t.space[1] }}>
                建议切换到 {switchSuggestion.providerId}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View
          style={[
            styles.inputBar,
            {
              paddingHorizontal: t.space[4],
              paddingTop: t.space[2],
              paddingBottom: Math.max(insets.bottom, t.space[3]),
            },
          ]}
        >
          <ChatInput
            onSend={(text) => {
              void handleSend(text);
            }}
            onAttachment={() => setAttachmentVisible(true)}
            onVoiceStart={handleVoiceStart}
            onVoiceSend={handleVoiceSend}
            onVoiceCancel={handleVoiceCancel}
            voiceState={voice.state}
            voiceMetering={voice.metering}
          />
        </View>
      </View>

      <AppDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        onCreateSession={() => {
          resetSession();
          setToastMessage('已新建会话');
        }}
      />

      <AttachmentSheet
        visible={attachmentVisible}
        onClose={() => setAttachmentVisible(false)}
        onImageSelected={(asset) => {
          setToastMessage(`已选择附件：${asset.fileName || 'image'}`);
        }}
        onAction={(action) => {
          setToastMessage(`触发附件动作：${action}`);
        }}
      />

      <Toast
        message={toastMessage}
        onDismiss={() => setToastMessage(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  logoImage: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
  },
  messageList: {
    flexGrow: 1,
    paddingTop: 8,
  },
  emptyConversation: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 48,
  },
  messageBubble: {},
  inputBar: {},
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 8,
  },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  switchChipWrap: {},
  switchChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
});
