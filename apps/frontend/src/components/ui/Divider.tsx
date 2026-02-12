import React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

import { useThemeTokens } from '@/theme';

/* ---------- Contract-aligned props ---------- */

type DividerOrientation = 'horizontal' | 'vertical';
type DividerTone = 'default' | 'subtle';

export interface DividerProps extends ViewProps {
  orientation?: DividerOrientation;
  tone?: DividerTone;
}

export function Divider({
  orientation = 'horizontal',
  tone = 'default',
  style,
  ...rest
}: DividerProps) {
  const t = useThemeTokens();

  const color = tone === 'subtle' ? t.color.borderSubtle : t.color.border;

  const sizeStyle =
    orientation === 'horizontal'
      ? { height: 1, width: '100%' as const }
      : { width: 1, height: '100%' as const };

  return (
    <View style={[sizeStyle, { backgroundColor: color }, style]} {...rest} />
  );
}
