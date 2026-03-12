export const CONTROL_CONSOLE_API_BASE_URL =
  (import.meta.env.VITE_WORKFLOW_PLATFORM_API_BASE_URL || 'http://127.0.0.1:8791').replace(/\/$/, '');

export const CONTROL_CONSOLE_POLLING_MS = {
  runs: 7_500,
  approvals: 5_000,
  drafts: 8_000,
} as const;

export const CONTROL_CONSOLE_STREAM_STALE_MS = 35_000;
export const CONTROL_CONSOLE_STREAM_RETRY_MS = 10_000;

export type ControlConsolePollKey = keyof typeof CONTROL_CONSOLE_POLLING_MS;
