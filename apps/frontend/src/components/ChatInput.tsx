import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useThemeTokens } from '@/theme';
import { Text } from './ui';
import { WaveformBars } from './WaveformBars';
import type { VoiceState } from '@/hooks/useVoiceRecorder';

/* ---------- Types ---------- */

export interface ChatInputProps {
  /** Called when the user presses Send (text mode). */
  onSend?: (text: string) => void;
  /** Called when the user presses the attachment (+) button. */
  onAttachment?: () => void;
  /** Called when the user taps the microphone button to start recording. */
  onVoiceStart?: () => void;
  /** Called when the user taps send in recording mode (stop + transcribe). */
  onVoiceSend?: () => void;
  /** Called when the user taps cancel (red X) in voice mode. */
  onVoiceCancel?: () => void;
  /** Current voice recorder state (driven by parent). */
  voiceState?: VoiceState;
  /** Current metering level (dB). */
  voiceMetering?: number;
  placeholder?: string;
}

/* ---------- Constants ---------- */

const ROW_H = 36;
const ATTACH_ICON = 26;
const VOICE_ICON = 22;
const SEND_SIZE = 32;
const SEND_ICON = 18;
const CANCEL_ICON = 22;

/* ---------- Component ---------- */

export function ChatInput({
  onSend,
  onAttachment,
  onVoiceStart,
  onVoiceSend,
  onVoiceCancel,
  voiceState = 'idle',
  voiceMetering = -60,
  placeholder = '给 AI 发消息…',
}: ChatInputProps) {
  const t = useThemeTokens();
  const [text, setText] = useState('');
  const isMultiline = text.includes('\n') || text.length > 80;

  const isRecording = voiceState === 'recording';
  const isTranscribing = voiceState === 'transcribing';
  const isVoiceActive = isRecording || isTranscribing;

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setText('');
  };

  /* ========== Recording / Transcribing layout ========== */
  if (isVoiceActive) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: t.color.surfaceElevated,
            borderColor: t.color.border,
            borderWidth: t.border.width.sm,
            borderRadius: t.radius.full,
            paddingVertical: t.space[2],
            paddingLeft: t.space[1],
            paddingRight: t.space[2],
          },
        ]}
      >
        {/* Cancel button (red X) */}
        <Pressable
          onPress={onVoiceCancel}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Ionicons
            name="close"
            size={CANCEL_ICON}
            color={isTranscribing ? t.color.textMuted : t.color.danger}
          />
        </Pressable>

        {/* Middle: scrolling waveform or transcribing indicator */}
        <View style={styles.voiceMiddle}>
          {isRecording ? (
            <WaveformBars metering={voiceMetering} active />
          ) : (
            <View style={styles.transcribingRow}>
              <ActivityIndicator size="small" color={t.color.textMuted} />
              <Text
                variant="caption"
                style={{ color: t.color.textMuted, marginLeft: 8 }}
              >
                正在转译…
              </Text>
            </View>
          )}
        </View>

        {/* Send button */}
        <View style={styles.sendWrapper}>
          <Pressable
            onPress={isRecording ? onVoiceSend : undefined}
            disabled={isTranscribing}
            hitSlop={{ top: 0, bottom: 0, left: 0, right: 4 }}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor: isRecording
                  ? (t.mode === 'dark' ? t.color.accent : t.color.primary)
                  : t.color.textMuted,
                opacity: isTranscribing ? 0.4 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Ionicons name="arrow-up" size={SEND_ICON} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  }

  /* ========== Normal text input layout ========== */
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: t.color.surfaceElevated,
          borderColor: t.color.border,
          borderWidth: t.border.width.sm,
          borderRadius: isMultiline ? t.radius.lg : t.radius.full,
          paddingVertical: t.space[2],
          paddingLeft: t.space[1],
          paddingRight: t.space[2],
        },
      ]}
    >
      {/* Attachment button */}
      <Pressable
        onPress={onAttachment}
        hitSlop={8}
        style={({ pressed }) => [
          styles.iconBtn,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Ionicons
          name="add"
          size={ATTACH_ICON}
          color={t.color.textMuted}
          style={{ marginTop: -1 }}
        />
      </Pressable>

      {/* Text input */}
      <View style={styles.inputWrapper}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={t.color.textMuted}
          multiline
          maxLength={4000}
          style={[
            styles.input,
            {
              color: t.color.textPrimary,
              fontSize: t.typography.size.bodyLg,
              fontFamily: t.typography.family.sans,
            },
          ]}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
      </View>

      {/* Voice button */}
      <Pressable
        onPress={onVoiceStart}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 0 }}
        style={({ pressed }) => [
          styles.voiceBtn,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Ionicons name="mic-outline" size={VOICE_ICON} color={t.color.textMuted} />
      </Pressable>

      {/* Send button */}
      <View style={styles.sendWrapper}>
        <Pressable
          onPress={handleSend}
          hitSlop={{ top: 0, bottom: 0, left: 0, right: 4 }}
          style={({ pressed }) => [
            styles.sendBtn,
            {
              backgroundColor: text.trim()
                ? (t.mode === 'dark' ? t.color.accent : t.color.primary)
                : t.color.textMuted,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Ionicons name="arrow-up" size={SEND_ICON} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: ROW_H,
    height: ROW_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputWrapper: {
    flex: 1,
    justifyContent: 'center',
    minHeight: ROW_H,
  },
  input: {
    maxHeight: 120,
    paddingVertical: 0,
    paddingHorizontal: 4,
    textAlignVertical: 'center',
  },
  voiceBtn: {
    width: ROW_H,
    height: ROW_H,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  sendWrapper: {
    width: ROW_H,
    height: ROW_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtn: {
    width: SEND_SIZE,
    height: SEND_SIZE,
    borderRadius: SEND_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Voice mode styles */
  voiceMiddle: {
    flex: 1,
    justifyContent: 'center',
    minHeight: ROW_H,
    overflow: 'hidden',
  },
  transcribingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
