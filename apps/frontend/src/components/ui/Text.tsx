import React from 'react';
import { Text as RNText, StyleSheet } from 'react-native';
import type { TextProps as RNTextProps } from 'react-native';

import { useThemeTokens } from '@/theme';

/* ---------- Contract-aligned props ---------- */

type TextVariant = 'body' | 'caption' | 'label' | 'h3' | 'h2' | 'h1';
type TextTone = 'primary' | 'secondary' | 'muted' | 'danger';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
}

export function Text({
  variant = 'body',
  tone = 'primary',
  style,
  ...rest
}: TextProps) {
  const t = useThemeTokens();

  const variantStyle = VARIANT_MAP[variant](t);
  const toneColor = TONE_MAP[tone](t);

  return (
    <RNText
      style={[variantStyle, { color: toneColor }, style]}
      {...rest}
    />
  );
}

/* ---------- Mapping helpers ---------- */

type T = ReturnType<typeof useThemeTokens>;

const VARIANT_MAP: Record<TextVariant, (t: T) => object> = {
  body: (t) => ({
    fontSize: t.typography.size.body,
    lineHeight: t.typography.lineHeight.body,
    fontFamily: t.typography.family.sans,
    fontWeight: t.typography.weight.regular,
  }),
  caption: (t) => ({
    fontSize: t.typography.size.caption,
    lineHeight: t.typography.lineHeight.caption,
    fontFamily: t.typography.family.sans,
    fontWeight: t.typography.weight.regular,
  }),
  label: (t) => ({
    fontSize: t.typography.size.caption,
    lineHeight: t.typography.lineHeight.caption,
    fontFamily: t.typography.family.sansMedium,
    fontWeight: t.typography.weight.medium,
  }),
  h3: (t) => ({
    fontSize: t.typography.size.h3,
    lineHeight: t.typography.lineHeight.heading,
    fontFamily: t.typography.family.sansSemibold,
    fontWeight: t.typography.weight.semibold,
  }),
  h2: (t) => ({
    fontSize: t.typography.size.h2,
    lineHeight: t.typography.lineHeight.heading,
    fontFamily: t.typography.family.sansSemibold,
    fontWeight: t.typography.weight.semibold,
  }),
  h1: (t) => ({
    fontSize: t.typography.size.h1,
    lineHeight: t.typography.lineHeight.heading,
    fontFamily: t.typography.family.sansBold,
    fontWeight: t.typography.weight.bold,
  }),
};

const TONE_MAP: Record<TextTone, (t: T) => string> = {
  primary: (t) => t.color.textPrimary,
  secondary: (t) => t.color.textSecondary,
  muted: (t) => t.color.textMuted,
  danger: (t) => t.color.danger,
};
