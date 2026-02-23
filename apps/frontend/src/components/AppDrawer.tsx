import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Modal,
  Pressable,
  ScrollView,
  Animated,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useThemeTokens } from '@/theme';
import { Text } from './ui';

/* ---------- Constants ---------- */

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.8;

/* ---------- Placeholder conversation history ---------- */

interface ChatItem {
  id: string;
  title: string;
  date: string;
  isActive?: boolean;
}

const RECENT_CHATS: ChatItem[] = [
  {
    id: '1',
    title: '营销策略分析',
    date: '今天 10:24',
    isActive: true,
  },
  {
    id: '2',
    title: 'Python API 文档',
    date: '昨天 16:12',
  },
  {
    id: '3',
    title: '邮件草稿：会议跟进',
    date: '10月24日',
  },
  {
    id: '4',
    title: '三种食材的食谱',
    date: '10月22日',
  },
  {
    id: '5',
    title: '礼物推荐清单',
    date: '10月20日',
  },
];

/* ---------- Props ---------- */

export interface AppDrawerProps {
  visible: boolean;
  onClose: () => void;
  onCreateSession?: () => void;
}

/* ---------- Component ---------- */

export function AppDrawer({ visible, onClose, onCreateSession }: AppDrawerProps) {
  const t = useThemeTokens();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [showSessionTools, setShowSessionTools] = useState(false);

  /* ---- Slide animation ---- */
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 220,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0.4,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slideAnim.setValue(-DRAWER_WIDTH);
      backdropAnim.setValue(0);
    }
  }, [visible, slideAnim, backdropAnim]);

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -DRAWER_WIDTH,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  }, [slideAnim, backdropAnim, onClose]);

  useEffect(() => {
    if (!visible) {
      setShowSessionTools(false);
    }
  }, [visible]);

  const navigateTo = useCallback(
    (path: string) => {
      handleClose();
      // Small delay to let drawer close animation finish
      setTimeout(() => router.push(path as any), 250);
    },
    [handleClose, router],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Animated.View
          style={[styles.backdropFill, { opacity: backdropAnim }]}
        />
      </Pressable>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          {
            width: DRAWER_WIDTH,
            backgroundColor: t.color.bg,
            transform: [{ translateX: slideAnim }],
            paddingTop: insets.top + t.space[3],
            paddingBottom: Math.max(insets.bottom, t.space[3]),
          },
        ]}
      >
        {/* ── Section header ── */}
        <View style={[styles.sectionHeader, { paddingHorizontal: t.space[4] }]}>
          <Text
            variant="caption"
            style={{
              color: t.color.textMuted,
              fontWeight: '600',
              letterSpacing: 1,
              textTransform: 'uppercase',
              fontSize: 11,
            }}
          >
            最近对话
          </Text>
        </View>

        {/* ── Conversation list ── */}
        <ScrollView
          style={styles.chatList}
          contentContainerStyle={{ paddingHorizontal: t.space[3] }}
          showsVerticalScrollIndicator={false}
        >
          {RECENT_CHATS.map((chat) => (
            <Pressable
              key={chat.id}
              onPress={handleClose}
              style={({ pressed }) => [
                styles.chatItem,
                {
                  backgroundColor: chat.isActive
                    ? (t.mode === 'dark'
                        ? t.color.surface
                        : t.color.borderSubtle)
                    : pressed
                      ? t.color.surfaceElevated
                      : 'transparent',
                  borderRadius: t.radius.lg,
                  paddingVertical: t.space[3],
                  paddingHorizontal: t.space[4],
                },
              ]}
            >
              <View style={styles.chatItemContent}>
                <Text
                  variant="body"
                  style={{
                    fontWeight: chat.isActive ? '600' : '400',
                    color: t.color.textPrimary,
                  }}
                  numberOfLines={1}
                >
                  {chat.title}
                </Text>
                <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  {chat.date}
                </Text>
              </View>
              {chat.isActive && (
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={t.color.textMuted}
                />
              )}
            </Pressable>
          ))}
        </ScrollView>

        {/* ── Bottom section ── */}
        <View
          style={[
            styles.bottomSection,
            {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: t.color.borderSubtle,
              paddingHorizontal: t.space[3],
              paddingTop: t.space[3],
            },
          ]}
        >
          {/* Session tools */}
          <Pressable
            onPress={() => setShowSessionTools((prev) => !prev)}
            style={({ pressed }) => [
              styles.bottomItem,
              {
                borderRadius: t.radius.md,
                paddingVertical: t.space[3],
                paddingHorizontal: t.space[4],
                backgroundColor: pressed ? t.color.surfaceElevated : 'transparent',
              },
            ]}
          >
            <Ionicons
              name="albums-outline"
              size={20}
              color={t.color.textSecondary}
            />
            <Text
              variant="body"
              style={{ marginLeft: t.space[3], color: t.color.textPrimary, flex: 1 }}
            >
              会话管理
            </Text>
            <Ionicons
              name={showSessionTools ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={t.color.textMuted}
            />
          </Pressable>

          {showSessionTools && (
            <Pressable
              onPress={() => {
                onCreateSession?.();
                handleClose();
              }}
              style={({ pressed }) => [
                styles.subItem,
                {
                  borderRadius: t.radius.md,
                  paddingVertical: t.space[2],
                  paddingHorizontal: t.space[4],
                  marginLeft: t.space[6],
                  backgroundColor: pressed ? t.color.surfaceElevated : 'transparent',
                },
              ]}
            >
              <Ionicons
                name="add-circle-outline"
                size={18}
                color={t.color.textSecondary}
              />
              <Text
                variant="caption"
                style={{ marginLeft: t.space[2], color: t.color.textSecondary }}
              >
                新建会话
              </Text>
            </Pressable>
          )}

          {/* Settings */}
          <Pressable
            onPress={() => navigateTo('/settings')}
            style={({ pressed }) => [
              styles.bottomItem,
              {
                borderRadius: t.radius.md,
                paddingVertical: t.space[3],
                paddingHorizontal: t.space[4],
                backgroundColor: pressed ? t.color.surfaceElevated : 'transparent',
              },
            ]}
          >
            <Ionicons
              name="settings-outline"
              size={20}
              color={t.color.textSecondary}
            />
            <Text
              variant="body"
              style={{ marginLeft: t.space[3], color: t.color.textPrimary }}
            >
              设置
            </Text>
          </Pressable>

          {/* Account */}
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [
              styles.bottomItem,
              {
                borderRadius: t.radius.md,
                paddingVertical: t.space[3],
                paddingHorizontal: t.space[4],
                backgroundColor: pressed ? t.color.surfaceElevated : 'transparent',
              },
            ]}
          >
            <View
              style={[
                styles.avatar,
                { backgroundColor: t.color.primary },
              ]}
            >
              <Text
                variant="caption"
                style={{ color: t.color.onPrimary, fontWeight: '700', fontSize: 12 }}
              >
                U
              </Text>
            </View>
            <Text
              variant="body"
              style={{ marginLeft: t.space[3], color: t.color.textPrimary }}
            >
              用户
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
  },
  sectionHeader: {
    paddingBottom: 8,
  },
  chatList: {
    flex: 1,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatItemContent: {
    flex: 1,
  },
  bottomSection: {},
  bottomItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
