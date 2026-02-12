import React, { useEffect, useRef, useCallback } from 'react';
import { Animated, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeTokens } from '@/theme';
import { Text } from './ui';

/* ---------- Props ---------- */

export interface ToastProps {
  /** Message to show. Set to empty string or null to hide. */
  message: string | null;
  /** Auto-dismiss after ms (default 3000). */
  duration?: number;
  /** Called when the toast is dismissed. */
  onDismiss?: () => void;
}

/* ---------- Component ---------- */

export function Toast({ message, duration = 3000, onDismiss }: ToastProps) {
  const t = useThemeTokens();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -20, duration: 200, useNativeDriver: true }),
    ]).start(() => onDismiss?.());
  }, [opacity, translateY, onDismiss]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (message) {
      // Show
      Animated.parallel([
        Animated.spring(opacity, { toValue: 1, useNativeDriver: true, damping: 15 }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 15 }),
      ]).start();

      // Auto-dismiss
      timerRef.current = setTimeout(dismiss, duration);
    } else {
      dismiss();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [message, duration, dismiss, opacity, translateY]);

  if (!message) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + 8,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Pressable
        onPress={dismiss}
        style={[
          styles.toast,
          {
            backgroundColor: t.color.surface,
            borderColor: t.color.border,
            borderWidth: t.border.width.sm,
            borderRadius: t.radius.lg,
            ...t.shadow.md,
          },
        ]}
      >
        <Text variant="caption" style={{ color: t.color.textSecondary }}>
          {message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '85%',
  },
});
