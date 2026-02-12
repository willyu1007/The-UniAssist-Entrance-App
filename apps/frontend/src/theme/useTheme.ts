import { useContext } from 'react';
import { ThemeContext } from './ThemeProvider';
import type { Theme } from './types';

/**
 * Access the current theme object anywhere in the component tree.
 *
 * ```tsx
 * const { theme } = useTheme();
 * <View style={{ backgroundColor: theme.color.bg }} />
 * ```
 */
export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Shortcut — returns the `Theme` directly (no themeMode / setThemeMode).
 */
export function useThemeTokens(): Theme {
  return useContext(ThemeContext).theme;
}
