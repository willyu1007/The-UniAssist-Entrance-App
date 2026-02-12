import React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

import { useThemeTokens } from '@/theme';
import type { Theme } from '@/theme';

/* ---------- Contract-aligned props ---------- */

type Direction = 'row' | 'col';
type Gap = keyof Theme['space'];
type Align = 'start' | 'center' | 'end' | 'stretch';
type Justify = 'start' | 'center' | 'between' | 'end';
type Wrap = 'wrap' | 'nowrap';

export interface StackProps extends ViewProps {
  direction?: Direction;
  gap?: Gap;
  align?: Align;
  justify?: Justify;
  wrap?: Wrap;
}

const ALIGN_MAP: Record<Align, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

const JUSTIFY_MAP: Record<Justify, string> = {
  start: 'flex-start',
  center: 'center',
  between: 'space-between',
  end: 'flex-end',
};

export function Stack({
  direction = 'col',
  gap = 0,
  align,
  justify,
  wrap,
  style,
  ...rest
}: StackProps) {
  const t = useThemeTokens();

  return (
    <View
      style={[
        {
          flexDirection: direction === 'row' ? 'row' : 'column',
          gap: t.space[gap],
        },
        align != null && { alignItems: ALIGN_MAP[align] as any },
        justify != null && { justifyContent: JUSTIFY_MAP[justify] as any },
        wrap != null && { flexWrap: wrap },
        style,
      ]}
      {...rest}
    />
  );
}
