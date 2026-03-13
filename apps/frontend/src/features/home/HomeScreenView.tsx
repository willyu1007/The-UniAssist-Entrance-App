import React from 'react';
import {
  View,
  FlatList,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, Toolbar, ToolbarSlot, IconButton } from '@/components/ui';
import { FeaturePicker } from '@/components/FeaturePicker';
import { ChatInput } from '@/components/ChatInput';
import { AttachmentSheet } from '@/components/AttachmentSheet';
import { AppDrawer } from '@/components/AppDrawer';
import { Toast } from '@/components/Toast';
import { useThemeTokens } from '@/theme';

import { FEATURES, GATEWAY_BASE_URL, LOGO_SIZE, logoIcon } from './constants';
import { InteractionBody } from './InteractionBody';
import type { HomeController } from './useHomeController';

function draftStatusText(status: string): string {
  switch (status) {
    case 'created':
      return '已创建';
    case 'collecting_input':
      return '信息收集中';
    case 'synthesized':
      return '已合成';
    case 'editable':
      return '可编辑';
    case 'publishable':
      return '可发布';
    case 'published':
      return '已发布';
    default:
      return status;
  }
}

export function HomeScreenView({ controller }: { controller: HomeController }) {
  const t = useThemeTokens();
  const insets = useSafeAreaInsets();
  const builderDraftCount = Object.keys(controller.builderDrafts).length;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: t.color.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}> 
        <Toolbar>
          <ToolbarSlot>
            <IconButton onPress={() => controller.setDrawerVisible(true)}>
              <Ionicons name="menu" size={24} color={t.color.textPrimary} />
            </IconButton>
          </ToolbarSlot>

          <ToolbarSlot>
            <FeaturePicker
              options={FEATURES}
              selectedKey={controller.selectedFeature}
              onSelect={controller.setSelectedFeature}
            />
          </ToolbarSlot>

          <ToolbarSlot>
            <IconButton onPress={controller.handleLogoPress}>
              <Image
                source={logoIcon}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </IconButton>
          </ToolbarSlot>
        </Toolbar>

        {GATEWAY_BASE_URL ? (
          <View
            style={[
              styles.transportStatusWrap,
              { paddingHorizontal: t.space[4], paddingBottom: t.space[2] },
            ]}
          >
            <View
              style={[
                styles.transportStatusPill,
                {
                  borderRadius: t.radius.full,
                  borderColor: t.color.border,
                  borderWidth: t.border.width.sm,
                  backgroundColor: t.color.surface,
                },
              ]}
            >
              <Text variant="caption" tone="muted">
                通道: {controller.transportMode} · 状态: {controller.transportState} · cursor: {controller.cursor}
              </Text>
            </View>
          </View>
        ) : null}

        <View
          style={[
            styles.builderStripWrap,
            {
              paddingHorizontal: t.space[4],
              paddingBottom: t.space[2],
            },
          ]}
        >
          <Pressable
            onPress={() => {
              void controller.handleBuilderQuickEntry();
            }}
            style={({ pressed }) => [
              styles.builderEntryButton,
              {
                borderRadius: t.radius.full,
                backgroundColor: pressed ? t.color.primaryActive : t.color.primary,
              },
            ]}
          >
            <Ionicons name="construct-outline" size={14} color={t.color.onPrimary} />
            <Text variant="caption" style={{ color: t.color.onPrimary, marginLeft: t.space[1] }}>
              打开 Workflow Builder
            </Text>
          </Pressable>

          {controller.activeBuilderDraft ? (
            <View
              style={[
                styles.builderStatusPill,
                {
                  borderRadius: t.radius.full,
                  borderColor: t.color.border,
                  borderWidth: t.border.width.sm,
                  backgroundColor: t.color.surface,
                },
              ]}
            >
              <Text variant="caption" tone="muted">
                当前草稿: {controller.activeBuilderDraft.name || controller.activeBuilderDraft.workflowKey || controller.activeBuilderDraft.draftId.slice(0, 8)}
                {' · '}
                {draftStatusText(controller.activeBuilderDraft.status)}
                {controller.activeBuilderDraft.publishable ? ' · 可发布' : ''}
              </Text>
            </View>
          ) : null}

          {builderDraftCount > 1 ? (
            <View
              style={[
                styles.builderStatusPill,
                {
                  borderRadius: t.radius.full,
                  borderColor: t.color.border,
                  borderWidth: t.border.width.sm,
                  backgroundColor: t.color.surface,
                },
              ]}
            >
              <Text variant="caption" tone="muted">
                当前会话已关联 {builderDraftCount} 条 Builder 草稿
              </Text>
            </View>
          ) : null}
        </View>

        <FlatList
          data={controller.items}
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
                发送消息开始对话（workflow platform 兼容模式）
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: t.space[2] }}>
                也可以点上方按钮，或使用 `@builder ` 前缀进入 Workflow Builder。
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

                {!item.text && item.interaction ? (
                  <InteractionBody
                    item={item}
                    postInteraction={controller.postInteraction}
                    setActiveTask={controller.setActiveTask}
                    setToastMessage={controller.setToastMessage}
                  />
                ) : null}
              </View>
            );
          }}
        />

        {controller.switchSuggestion ? (
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
                void controller.postInteraction({
                  actionId: controller.switchSuggestion?.actionId || '',
                  providerId: controller.switchSuggestion?.providerId || 'builtin_chat',
                  runId: controller.switchSuggestion?.runId,
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
                建议切换到 {controller.switchSuggestion.providerId}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {controller.activeTask ? (
          <View
            style={[
              styles.taskFocusWrap,
              {
                paddingHorizontal: t.space[4],
                paddingBottom: t.space[2],
              },
            ]}
          >
            <View
              style={[
                styles.taskFocusPill,
                {
                  borderRadius: t.radius.full,
                  borderColor: t.color.border,
                  borderWidth: t.border.width.sm,
                  backgroundColor: t.color.surface,
                },
              ]}
            >
              <Text variant="caption" tone="muted">
                当前任务: {controller.activeTask.providerId} · {controller.activeTask.taskId}
              </Text>
              <Pressable
                onPress={() => controller.setActiveTask(null)}
                style={({ pressed }) => [
                  styles.taskFocusClear,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Ionicons name="close" size={14} color={t.color.textSecondary} />
              </Pressable>
            </View>
          </View>
        ) : controller.pendingTaskPickerVisible && controller.pendingTasks.length > 1 ? (
          <View
            style={[
              styles.taskFocusWrap,
              {
                paddingHorizontal: t.space[4],
                paddingBottom: t.space[2],
              },
            ]}
          >
            <View
              style={[
                styles.pendingPickerBox,
                {
                  borderRadius: t.radius.md,
                  borderColor: t.color.border,
                  borderWidth: t.border.width.sm,
                  backgroundColor: t.color.surface,
                },
              ]}
            >
              <Text variant="caption" tone="muted">
                选择任务后发送{controller.pendingReplyDraft ? '：' : ''}
                {controller.pendingReplyDraft ? `「${controller.pendingReplyDraft}」` : ''}
              </Text>
              <View style={styles.actionRow}>
                {controller.pendingTasks.map((task) => (
                  <Pressable
                    key={task.taskId}
                    onPress={() => controller.handlePickPendingTask(task)}
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
                    <Text variant="caption">{task.providerId} · {task.taskId}</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => {
                    controller.setPendingTaskPickerVisible(false);
                    controller.setPendingReplyDraft(null);
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
                  <Text variant="caption" tone="muted">取消</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : controller.pendingTasks.length > 1 ? (
          <View
            style={[
              styles.taskFocusWrap,
              {
                paddingHorizontal: t.space[4],
                paddingBottom: t.space[2],
              },
            ]}
          >
            <View
              style={[
                styles.taskFocusPill,
                {
                  borderRadius: t.radius.full,
                  borderColor: t.color.border,
                  borderWidth: t.border.width.sm,
                  backgroundColor: t.color.surface,
                },
              ]}
            >
              <Text variant="caption" tone="muted">
                检测到 {controller.pendingTasks.length} 个待处理任务，发送前会先选择目标任务
              </Text>
            </View>
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
              void controller.handleSend(text);
            }}
            onAttachment={() => controller.setAttachmentVisible(true)}
            onVoiceStart={controller.handleVoiceStart}
            onVoiceSend={controller.handleVoiceSend}
            onVoiceCancel={controller.handleVoiceCancel}
            voiceState={controller.voice.state}
            voiceMetering={controller.voice.metering}
            placeholder={controller.activeTask ? `回复任务 ${controller.activeTask.taskId}...` : '给 AI 发消息…'}
          />
        </View>
      </View>

      <AppDrawer
        visible={controller.drawerVisible}
        onClose={() => controller.setDrawerVisible(false)}
        onCreateSession={() => {
          controller.resetSession();
          controller.setToastMessage('已新建会话');
        }}
      />

      <AttachmentSheet
        visible={controller.attachmentVisible}
        onClose={() => controller.setAttachmentVisible(false)}
        onImageSelected={(asset) => {
          controller.setToastMessage(`已选择附件：${asset.fileName || 'image'}`);
        }}
        onAction={(action) => {
          controller.setToastMessage(`触发附件动作：${action}`);
        }}
      />

      <Toast
        message={controller.toastMessage}
        onDismiss={() => controller.setToastMessage(null)}
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
  taskFocusWrap: {},
  taskFocusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
  },
  taskFocusClear: {
    marginLeft: 6,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingPickerBox: {
    alignSelf: 'stretch',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  transportStatusWrap: {},
  transportStatusPill: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  builderStripWrap: {
    gap: 8,
  },
  builderEntryButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  builderStatusPill: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
});
