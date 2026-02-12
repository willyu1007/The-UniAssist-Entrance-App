import React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

import { useThemeTokens } from '@/theme';

/* ---------- Contract-aligned props ---------- */

export interface ToolbarProps extends ViewProps {
  align?: 'start' | 'between' | 'end';
}

export function Toolbar({ align = 'between', style, ...rest }: ToolbarProps) {
  const t = useThemeTokens();

  const justifyContent =
    align === 'between'
      ? 'space-between'
      : align === 'end'
        ? 'flex-end'
        : 'flex-start';

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[3],
          justifyContent: justifyContent as any,
          paddingVertical: t.space[2],
          paddingHorizontal: t.space[4],
        },
        style,
      ]}
      {...rest}
    />
  );
}

/* ---------- Slot containers ---------- */

export function ToolbarSlot({
  children,
  style,
  ...rest
}: ViewProps) {
  const t = useThemeTokens();

  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }, style]}
      {...rest}
    >
      {children}
    </View>
  );
}
