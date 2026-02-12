import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useThemeTokens } from '@/theme';
import { Text } from './ui';

export interface QuickActionCardProps {
  title: string;
  subtitle: string;
  onPress?: () => void;
}

export function QuickActionCard({
  title,
  subtitle,
  onPress,
}: QuickActionCardProps) {
  const t = useThemeTokens();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.color.surface,
          borderColor: t.color.border,
          borderWidth: t.border.width.sm,
          borderRadius: t.radius.lg,
          padding: t.space[4],
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text variant="label" style={styles.title}>
        {title}
      </Text>
      <Text variant="caption" tone="muted">
        {subtitle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 88,
  },
  title: {
    marginBottom: 4,
  },
});
