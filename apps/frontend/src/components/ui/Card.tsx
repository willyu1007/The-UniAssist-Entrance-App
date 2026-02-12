import React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

import { useThemeTokens } from '@/theme';

/* ---------- Contract-aligned props ---------- */

type CardVariant = 'default' | 'outlined';
type CardPadding = 'sm' | 'md' | 'lg';
type CardElevation = 'none' | 'sm' | 'md';

export interface CardProps extends ViewProps {
  variant?: CardVariant;
  padding?: CardPadding;
  elevation?: CardElevation;
}

export function Card({
  variant = 'default',
  padding = 'md',
  elevation = 'none',
  style,
  ...rest
}: CardProps) {
  const t = useThemeTokens();

  const paddingValue =
    padding === 'sm' ? t.space[3] : padding === 'lg' ? t.space[5] : t.space[4];

  return (
    <View
      style={[
        {
          backgroundColor: t.color.surface,
          borderRadius: t.radius.lg,
          borderWidth: t.border.width.sm,
          borderColor: t.color.border,
          padding: paddingValue,
        },
        elevation !== 'none' && t.shadow[elevation],
        style,
      ]}
      {...rest}
    />
  );
}
