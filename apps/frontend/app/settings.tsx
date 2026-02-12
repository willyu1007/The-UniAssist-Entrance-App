import React from 'react';
import { View, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useTheme, useThemeTokens } from '@/theme';
import { Text } from '@/components/ui';
import type { ThemeMode } from '@/theme';

/* ---------- Theme options ---------- */

interface ThemeOption {
  key: ThemeMode;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  description: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    key: 'auto',
    label: '跟随系统',
    icon: 'phone-portrait-outline',
    description: '自动匹配系统的浅色或深色模式',
  },
  {
    key: 'light',
    label: '浅色模式',
    icon: 'sunny-outline',
    description: '始终使用浅色主题',
  },
  {
    key: 'dark',
    label: '深色模式',
    icon: 'moon-outline',
    description: '始终使用深色主题',
  },
];

/* ---------- Screen ---------- */

export default function SettingsScreen() {
  const t = useThemeTokens();
  const { themeMode, setThemeMode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: t.color.bg,
          paddingTop: insets.top,
        },
      ]}
    >
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: t.space[4],
            paddingVertical: t.space[3],
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: t.color.borderSubtle,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [
            styles.backBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Ionicons name="arrow-back" size={24} color={t.color.textPrimary} />
        </Pressable>
        <Text variant="h2" style={{ flex: 1, textAlign: 'center' }}>
          设置
        </Text>
        {/* Spacer to center the title */}
        <View style={styles.backBtn} />
      </View>

      {/* ── Content ── */}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.space[4],
          paddingTop: t.space[5],
          paddingBottom: Math.max(insets.bottom, t.space[5]),
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Section: 界面设置 */}
        <Text
          variant="caption"
          style={{
            color: t.color.textMuted,
            fontWeight: '600',
            letterSpacing: 1,
            textTransform: 'uppercase',
            fontSize: 11,
            marginBottom: t.space[3],
          }}
        >
          界面设置
        </Text>

        <View
          style={[
            styles.card,
            {
              backgroundColor: t.color.surface,
              borderRadius: t.radius.lg,
              borderWidth: t.border.width.sm,
              borderColor: t.color.border,
            },
          ]}
        >
          <Text
            variant="label"
            style={{
              paddingHorizontal: t.space[4],
              paddingTop: t.space[4],
              paddingBottom: t.space[2],
            }}
          >
            主题色
          </Text>

          {THEME_OPTIONS.map((option, idx) => {
            const isSelected = themeMode === option.key;
            const isLast = idx === THEME_OPTIONS.length - 1;

            return (
              <Pressable
                key={option.key}
                onPress={() => setThemeMode(option.key)}
                style={({ pressed }) => [
                  styles.themeOption,
                  {
                    backgroundColor: pressed
                      ? t.color.surfaceElevated
                      : 'transparent',
                    paddingVertical: t.space[3],
                    paddingHorizontal: t.space[4],
                    borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
                    borderBottomColor: t.color.borderSubtle,
                  },
                ]}
              >
                <Ionicons
                  name={option.icon}
                  size={20}
                  color={isSelected ? t.color.primary : t.color.textMuted}
                />
                <View style={styles.themeOptionText}>
                  <Text
                    variant="body"
                    style={{
                      color: isSelected ? t.color.primary : t.color.textPrimary,
                      fontWeight: isSelected ? '600' : '400',
                    }}
                  >
                    {option.label}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {option.description}
                  </Text>
                </View>
                {isSelected && (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={t.color.primary}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    overflow: 'hidden',
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeOptionText: {
    flex: 1,
    marginLeft: 12,
  },
});
