import React, { createContext, useMemo, useState, useCallback, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as tokens from './tokens';
import { lightColors, darkColors } from './themes';
import type { Theme, ThemeMode } from './types';

/* ---------- Storage key ---------- */

const THEME_MODE_KEY = '@morethan/theme-mode';

/* ---------- Build a full Theme object ---------- */

function buildTheme(mode: 'light' | 'dark'): Theme {
  return {
    mode,
    color: mode === 'light' ? lightColors : darkColors,
    typography: tokens.typography,
    space: tokens.space,
    radius: tokens.radius,
    shadow: tokens.shadow,
    border: tokens.border,
    motion: tokens.motion,
    zIndex: tokens.zIndex,
  };
}

/* ---------- Context ---------- */

export interface ThemeContextValue {
  theme: Theme;
  /** Current preference: auto follows system. */
  themeMode: ThemeMode;
  /** Change theme preference (persisted to AsyncStorage). */
  setThemeMode: (mode: ThemeMode) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: buildTheme('light'),
  themeMode: 'auto',
  setThemeMode: () => {},
});

/* ---------- Provider ---------- */

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [themeMode, setThemeModeRaw] = useState<ThemeMode>('auto');
  const [loaded, setLoaded] = useState(false);

  /* Restore persisted theme preference on mount */
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_MODE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'auto') {
          setThemeModeRaw(stored);
        }
      } catch {
        // ignore read errors
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const setThemeMode = useCallback((m: ThemeMode) => {
    setThemeModeRaw(m);
    AsyncStorage.setItem(THEME_MODE_KEY, m).catch(() => {});
  }, []);

  const resolvedMode: 'light' | 'dark' =
    themeMode === 'auto' ? (systemScheme === 'dark' ? 'dark' : 'light') : themeMode;

  const theme = useMemo(() => buildTheme(resolvedMode), [resolvedMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, themeMode, setThemeMode }),
    [theme, themeMode, setThemeMode],
  );

  // Don't render until persisted preference is loaded to avoid flash
  if (!loaded) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
