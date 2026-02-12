import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { PressableProps, ViewStyle } from 'react-native';

import { useThemeTokens } from '@/theme';
import { Text } from './Text';

/* ---------- Contract-aligned props ---------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label?: string;
  children?: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  label,
  children,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const t = useThemeTokens();

  const bg = {
    primary: t.color.primary,
    secondary: t.color.surfaceElevated,
    ghost: 'transparent',
    danger: t.color.danger,
    accent: t.color.accent,
  }[variant];

  const fg = {
    primary: t.color.onPrimary,
    secondary: t.color.textPrimary,
    ghost: t.color.textPrimary,
    danger: t.color.onDanger,
    accent: t.color.onAccent,
  }[variant];

  const borderColor =
    variant === 'secondary' ? t.color.border : 'transparent';

  const paddingV = size === 'sm' ? t.space[2] : t.space[3];
  const paddingH =
    size === 'sm' ? t.space[3] : size === 'lg' ? t.space[5] : t.space[4];

  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: t.radius.md,
          borderWidth: t.border.width.sm,
          borderColor,
          paddingVertical: paddingV,
          paddingHorizontal: paddingH,
          opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
        } satisfies ViewStyle,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
      {...rest}
    >
      {children ??
        (label ? (
          <Text
            variant="label"
            style={{ color: fg }}
          >
            {label}
          </Text>
        ) : null)}
    </Pressable>
  );
}
