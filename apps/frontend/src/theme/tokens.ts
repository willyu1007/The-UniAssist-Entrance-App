/**
 * RN Token bridge — mapped from ui/tokens/base.json (v1.1.0)
 *
 * This is the React Native counterpart of the CSS custom-property
 * token layer.  Values are plain numbers (dp) or colour strings.
 *
 * Keep in sync with the SSOT: ui/tokens/base.json
 */

/* ---------- Color ---------- */

export const color = {
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
} as const;

/* ---------- Typography ---------- */

export const typography = {
  size: {
    caption: 12,
    body: 14,
    bodyLg: 16,
    h3: 16,
    h2: 20,
    h1: 24,
  },
  lineHeight: {
    caption: 16,
    body: 20,
    heading: 28,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  family: {
    sans: 'Inter_400Regular',
    sansMedium: 'Inter_500Medium',
    sansSemibold: 'Inter_600SemiBold',
    sansBold: 'Inter_700Bold',
    sansCN: 'NotoSansSC_400Regular',
    sansCNMedium: 'NotoSansSC_500Medium',
    sansCNBold: 'NotoSansSC_700Bold',
  },
} as const;

/* ---------- Spacing ---------- */

export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 40,
  8: 48,
} as const;

/* ---------- Border radius ---------- */

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
} as const;

/* ---------- Shadows (RN format) ---------- */

export const shadow = {
  none: {},
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
} as const;

/* ---------- Border ---------- */

export const border = {
  width: {
    sm: 1,
  },
} as const;

/* ---------- Motion ---------- */

export const motion = {
  durationFast: 120,
  durationNormal: 180,
} as const;

/* ---------- Z-index ---------- */

export const zIndex = {
  dropdown: 1000,
  modal: 1100,
  toast: 1200,
} as const;
