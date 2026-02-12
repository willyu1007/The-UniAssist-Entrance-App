import React, { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeTokens } from '@/theme';
import { Text, Toolbar, ToolbarSlot, IconButton } from '@/components/ui';
import { FeaturePicker } from '@/components/FeaturePicker';
import { ChatInput } from '@/components/ChatInput';
import { AttachmentSheet } from '@/components/AttachmentSheet';
import { AppDrawer } from '@/components/AppDrawer';
import { Toast } from '@/components/Toast';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import type { FeatureOption } from '@/components/FeaturePicker';

/* ---------- Assets ---------- */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const logoIcon = require('@/assets/logo-icon.png');

/* ---------- Placeholder data (template) ---------- */

const FEATURES: FeatureOption[] = [
  { key: 'chat', label: '对话' },
  { key: 'write', label: '写作' },
  { key: 'code', label: '编程' },
  { key: 'translate', label: '翻译' },
];

/* ---------- Constants ---------- */

const LOGO_SIZE = 28;

/* ---------- Types ---------- */

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

/* ---------- Screen ---------- */

export default function HomeScreen() {
  const t = useThemeTokens();
  const insets = useSafeAreaInsets();

  const [selectedFeature, setSelectedFeature] = useState('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachmentVisible, setAttachmentVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const voice = useVoiceRecorder();

  /* ---- Text send ---- */
  const handleSend = useCallback((text: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);

    // Placeholder: echo back as assistant reply
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `这是对「${text}」的占位回复`,
        },
      ]);
    }, 500);
  }, []);

  /* ---- Voice flow ---- */
  const handleVoiceStart = useCallback(async () => {
    const ok = await voice.start();
    if (!ok) {
      Alert.alert('无法录音', '请在系统设置中允许 MoreThan 访问麦克风');
    }
  }, [voice]);

  const handleVoiceSend = useCallback(async () => {
    const text = await voice.stopAndTranscribe();
    if (text) {
      handleSend(text);
    } else {
      setToastMessage('未能识别语音内容，请重试');
    }
  }, [voice, handleSend]);

  const handleVoiceCancel = useCallback(() => {
    voice.cancel();
  }, [voice]);

  /* ---- Logo press (placeholder entry point) ---- */
  const handleLogoPress = useCallback(() => {
    // TODO: implement logo entry action (e.g. about / feature hub)
    console.log('[HomeScreen] Logo pressed');
  }, []);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: t.color.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* ① Top navigation bar */}
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

        {/* ② Conversation area — always visible (WeChat-style) */}
        <FlatList
          data={messages}
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
                发送消息开始对话
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.messageBubble,
                {
                  alignSelf:
                    item.role === 'user' ? 'flex-end' : 'flex-start',
                  backgroundColor:
                    item.role === 'user'
                      ? t.color.primary
                      : t.color.surface,
                  borderColor:
                    item.role === 'assistant' ? t.color.border : 'transparent',
                  borderWidth: item.role === 'assistant' ? t.border.width.sm : 0,
                  borderRadius: t.radius.lg,
                  paddingVertical: t.space[3],
                  paddingHorizontal: t.space[4],
                  marginBottom: t.space[3],
                  maxWidth: '80%',
                },
              ]}
            >
              <Text
                variant="body"
                style={{
                  color:
                    item.role === 'user'
                      ? t.color.onPrimary
                      : t.color.textPrimary,
                }}
              >
                {item.content}
              </Text>
            </View>
          )}
        />

        {/* ③ Bottom chat input */}
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
            onSend={handleSend}
            onAttachment={() => setAttachmentVisible(true)}
            onVoiceStart={handleVoiceStart}
            onVoiceSend={handleVoiceSend}
            onVoiceCancel={handleVoiceCancel}
            voiceState={voice.state}
            voiceMetering={voice.metering}
          />
        </View>
      </View>

      {/* Drawer */}
      <AppDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      />

      {/* Attachment bottom sheet */}
      <AttachmentSheet
        visible={attachmentVisible}
        onClose={() => setAttachmentVisible(false)}
        onImageSelected={(asset) => {
          console.log('[HomeScreen] Image selected:', asset.uri);
        }}
        onAction={(action) => {
          console.log('[HomeScreen] Action:', action);
        }}
      />

      {/* Toast for voice errors */}
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
});
