import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';

import { useThemeTokens } from '@/theme';

/* ---------- Constants ---------- */

const BAR_WIDTH = 2.5;
const BAR_GAP = 1.5;
const MIN_HEIGHT = 3;
const CONTAINER_HEIGHT = 30;
const MAX_BAR_H = CONTAINER_HEIGHT * 0.85;

/* ---------- Props ---------- */

export interface WaveformBarsProps {
  /** Metering level in dB (typically -60 to 0). */
  metering: number;
  /** Whether actively recording. */
  active: boolean;
}

/* ---------- Component ---------- */

export function WaveformBars({ metering, active }: WaveformBarsProps) {
  const t = useThemeTokens();
  const [containerWidth, setContainerWidth] = useState(0);
  const historyRef = useRef<number[]>([]);
  const [bars, setBars] = useState<number[]>([]);

  // Calculate how many bars fit in the available width
  const barSlot = BAR_WIDTH + BAR_GAP;
  const maxBars = containerWidth > 0 ? Math.floor(containerWidth / barSlot) : 0;

  // Measure container
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  // Accumulate metering samples
  useEffect(() => {
    if (!active) {
      historyRef.current = [];
      setBars([]);
      return;
    }

    // Normalize metering (-60..0) → 0..1
    const normalized = Math.max(0, Math.min(1, (metering + 60) / 55));
    const height = MIN_HEIGHT + normalized * (MAX_BAR_H - MIN_HEIGHT);

    historyRef.current.push(height);

    // Trim to max visible bars
    if (historyRef.current.length > maxBars && maxBars > 0) {
      historyRef.current = historyRef.current.slice(-maxBars);
    }

    setBars([...historyRef.current]);
  }, [metering, active, maxBars]);

  return (
    <View style={styles.container} onLayout={onLayout}>
      {/* Bars are right-aligned: newest on the right */}
      <View style={styles.barsRow}>
        {bars.map((h, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: h,
                backgroundColor: t.color.textMuted,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: CONTAINER_HEIGHT,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: CONTAINER_HEIGHT,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    marginHorizontal: BAR_GAP / 2,
  },
});
