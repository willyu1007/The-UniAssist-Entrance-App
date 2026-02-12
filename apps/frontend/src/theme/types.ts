/**
 * Theme type definitions for the RN token bridge.
 */

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderSubtle: string;

  primary: string;
  primaryHover: string;
  primaryActive: string;
  onPrimary: string;

  accent: string;
  accentHover: string;
  accentActive: string;
  onAccent: string;

  danger: string;
  onDanger: string;
  success: string;
  onSuccess: string;
  warning: string;
  onWarning: string;

  focusRing: string;
}

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface Theme {
  mode: 'light' | 'dark';
  color: ThemeColors;
  typography: typeof import('./tokens').typography;
  space: typeof import('./tokens').space;
  radius: typeof import('./tokens').radius;
  shadow: typeof import('./tokens').shadow;
  border: typeof import('./tokens').border;
  motion: typeof import('./tokens').motion;
  zIndex: typeof import('./tokens').zIndex;
}
