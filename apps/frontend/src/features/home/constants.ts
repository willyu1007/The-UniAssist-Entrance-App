import type { FeatureOption } from '@/components/FeaturePicker';

export const FEATURES: FeatureOption[] = [
  { key: 'chat', label: '对话' },
  { key: 'write', label: '写作' },
  { key: 'code', label: '编程' },
  { key: 'translate', label: '翻译' },
];

export const LOGO_SIZE = 28;
export const GATEWAY_BASE_URL = (process.env.EXPO_PUBLIC_GATEWAY_BASE_URL || '').replace(/\/$/, '');
export const logoIcon = require('@/assets/logo-icon.png');
