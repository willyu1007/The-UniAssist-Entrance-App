import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';

import type { TaskLifecycleState } from '@baseinterface/contracts';
import { Text } from '@/components/ui';
import { useThemeTokens } from '@/theme';

import type { HomeController } from './useHomeController';
import type { ChatItem, TaskThreadView } from './types';

type Props = {
  item: ChatItem;
  postInteraction: HomeController['postInteraction'];
  setActiveTask: (task: TaskThreadView | null) => void;
  setToastMessage: (message: string | null) => void;
};

export function InteractionBody({
  item,
  postInteraction,
  setActiveTask,
  setToastMessage,
}: Props) {
  const t = useThemeTokens();

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
                onPress={async () => {
                  const result = await postInteraction({
                    actionId: action.actionId,
                    providerId: item.providerId || 'builtin_chat',
                    runId: item.runId,
                  });
                  if (action.actionId.startsWith('focus_task:') && result?.focusedTask) {
                    setActiveTask({
                      taskId: result.focusedTask.taskId,
                      providerId: result.focusedTask.providerId,
                      runId: result.focusedTask.runId,
                      state: 'collecting',
                      executionPolicy: 'require_user_confirm',
                      replyToken: result.focusedTask.replyToken,
                    });
                    setToastMessage(`已聚焦任务 ${result.focusedTask.taskId}`);
                  }
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
    if (event.extensionKind === 'task_question') {
      const fields = Object.keys((event.payload.answerSchema?.properties || {}) as Record<string, unknown>);
      return (
        <View>
          <Text variant="label">
            任务提问 · {event.payload.providerId}
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            {event.payload.prompt}
          </Text>
          {fields.map((field) => (
            <Text key={field} variant="caption" tone="muted" style={{ marginTop: 2 }}>
              - {field}
            </Text>
          ))}
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => {
                const focused: TaskThreadView = {
                  taskId: event.payload.taskId,
                  providerId: event.payload.providerId,
                  runId: event.payload.runId,
                  state: 'collecting',
                  executionPolicy: 'require_user_confirm',
                  questionId: event.payload.questionId,
                  replyToken: event.payload.replyToken,
                  prompt: event.payload.prompt,
                };
                setActiveTask(focused);
                setToastMessage(`已聚焦任务 ${focused.taskId}`);
                void postInteraction({
                  actionId: `focus_task:${event.payload.taskId}`,
                  providerId: event.payload.providerId,
                  runId: event.payload.runId,
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
              <Text variant="caption" style={{ color: t.color.onPrimary }}>
                继续此任务
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }

    if (event.extensionKind === 'task_state') {
      const stateText: Record<TaskLifecycleState, string> = {
        collecting: '信息收集中',
        ready: '已就绪',
        executing: '执行中',
        completed: '已完成',
        failed: '执行失败',
      };

      return (
        <View>
          <Text variant="label">
            任务状态 · {event.payload.providerId}
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            任务 {event.payload.taskId}: {stateText[event.payload.state]}
          </Text>
          {event.payload.state === 'ready' && event.payload.executionPolicy === 'require_user_confirm' ? (
            <Pressable
              onPress={() => {
                void postInteraction({
                  actionId: `execute_task:${event.payload.taskId}`,
                  providerId: event.payload.providerId,
                  runId: event.payload.runId,
                  inReplyTo: {
                    providerId: event.payload.providerId,
                    runId: event.payload.runId,
                    taskId: event.payload.taskId,
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
              <Text variant="caption" style={{ color: t.color.onPrimary }}>
                确认执行
              </Text>
            </Pressable>
          ) : null}
        </View>
      );
    }

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
          {event.extensionKind === 'data_collection_result'
            ? JSON.stringify(event.payload.values || {}, null, 2)
            : '{}'}
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
}

const styles = StyleSheet.create({
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
});
