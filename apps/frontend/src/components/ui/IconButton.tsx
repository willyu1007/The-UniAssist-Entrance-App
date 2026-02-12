import React from 'react';
import { Pressable } from 'react-native';
import type { PressableProps, ViewStyle } from 'react-native';

import { useThemeTokens } from '@/theme';

/* ---------- Contract-aligned props ---------- */

type IconButtonVariant = 'ghost' | 'secondary';
type IconButtonSize = 'sm' | 'md';

export interface IconButtonProps extends PressableProps {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

export function IconButton({
  variant = 'ghost',
  size = 'md',
  disabled,
  style,
  children,
  ...rest
}: IconButtonProps) {
  const t = useThemeTokens();

  const bg =
    variant === 'secondary' ? t.color.surfaceElevated : 'transparent';
  const borderColor =
    variant === 'secondary' ? t.color.border : 'transparent';

  const pad = size === 'sm' ? t.space[2] : t.space[3];

  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: t.radius.md,
          borderWidth: t.border.width.sm,
          borderColor,
          padding: pad,
          opacity: disabled ? 0.6 : pressed ? 0.7 : 1,
          alignItems: 'center',
          justifyContent: 'center',
        } satisfies ViewStyle,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}
