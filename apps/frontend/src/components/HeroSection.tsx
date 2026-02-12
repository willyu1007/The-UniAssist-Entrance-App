import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

import { useThemeTokens } from '@/theme';
import { Text } from './ui';

// High-res (1024px) source — RN handles downscaling per device density
// eslint-disable-next-line @typescript-eslint/no-var-requires
const logoIcon = require('@/assets/logo-icon.png');

/**
 * Hero section — morethan brand logo + welcome tagline.
 */

/** Display size for the logo image (dp). */
const LOGO_IMAGE_SIZE = 120;

export interface HeroSectionProps {
  tagline?: string;
}

export function HeroSection({
  tagline = '有什么可以帮你的？',
}: HeroSectionProps) {
  const t = useThemeTokens();

  return (
    <View style={styles.container}>
      {/* Logo — transparent background, auto-adapts to page bg */}
      <Image
        source={logoIcon}
        style={styles.logoImage}
        resizeMode="contain"
      />

      {/* Tagline */}
      <Text
        variant="h1"
        style={[
          styles.tagline,
          { color: t.mode === 'dark' ? t.color.textPrimary : t.color.primary },
        ]}
      >
        {tagline}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 32,
  },
  logoImage: {
    width: LOGO_IMAGE_SIZE,
    height: LOGO_IMAGE_SIZE,
    marginBottom: 20,
  },
  tagline: {
    textAlign: 'center',
  },
});
