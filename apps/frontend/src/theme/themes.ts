/**
 * Light and dark theme definitions.
 *
 * Each theme contains only the `color` subset that differs from
 * the base tokens.  The ThemeProvider merges with the base.
 *
 * Keep in sync with:
 *   ui/tokens/themes/default.light.json
 *   ui/tokens/themes/default.dark.json
 */

import type { ThemeColors } from './types';

export const lightColors: ThemeColors = {
  bg: '#FAF9F6',
  surface: '#ffffff',
  surfaceElevated: '#f5f4f1',
  textPrimary: '#111827',
  textSecondary: '#374151',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  borderSubtle: '#f3f4f6',

  primary: '#283E68',
  primaryHover: '#1F3050',
  primaryActive: '#172540',
  onPrimary: '#ffffff',

  accent: '#E1703C',
  accentHover: '#C9602F',
  accentActive: '#B45228',
  onAccent: '#ffffff',

  danger: '#dc2626',
  onDanger: '#ffffff',
  success: '#16a34a',
  onSuccess: '#ffffff',
  warning: '#d97706',
  onWarning: '#111827',

  focusRing: '#283E6866',
};

export const darkColors: ThemeColors = {
  bg: '#121212',
  surface: '#1E1E1E',
  surfaceElevated: '#2C2C2C',
  textPrimary: '#E5E7EB',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
  border: '#333333',
  borderSubtle: '#262626',

  primary: '#7B9CC7',
  primaryHover: '#9AB4D6',
  primaryActive: '#5E83B3',
  onPrimary: '#121212',

  accent: '#E1703C',
  accentHover: '#EB8A5E',
  accentActive: '#C9602F',
  onAccent: '#ffffff',

  danger: '#f87171',
  onDanger: '#121212',
  success: '#4ade80',
  onSuccess: '#121212',
  warning: '#fbbf24',
  onWarning: '#121212',

  focusRing: '#7B9CC780',
};
