import type { TimelineEvent } from '@baseinterface/contracts';

export type TimelineTransportState =
  | 'connecting'
  | 'open'
  | 'degraded'
  | 'recovering'
  | 'closed';

export type TimelineTransportMode = 'idle' | 'sse' | 'polling';

type TimelineEventEnvelope = {
  schemaVersion?: string;
  type?: string;
  event?: TimelineEvent;
};

type EventSourceLike = {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close: () => void;
};

type EventSourceCtor = new (url: string) => EventSourceLike;

export type TimelineTransportOptions = {
  baseUrl: string;
  sessionId: string;
  initialCursor?: number;
  pollIntervalMs?: number;
  sseStaleMs?: number;
  minModeDwellMs?: number;
  recoverAfterPollSuccesses?: number;
  onEvents: (events: TimelineEvent[]) => void;
  onCursor?: (cursor: number) => void;
  onStatus?: (state: TimelineTransportState, mode: TimelineTransportMode) => void;
  onError?: (error: string) => void;
};

function now(): number {
  return Date.now();
}

export class TimelineTransport {
  private readonly options: Required<Omit<TimelineTransportOptions, 'onCursor' | 'onStatus' | 'onError'>> & Pick<TimelineTransportOptions, 'onCursor' | 'onStatus' | 'onError'>;

  private cursor: number;

  private stopped = false;

  private mode: TimelineTransportMode = 'idle';

  private state: TimelineTransportState = 'closed';

  private eventSource: EventSourceLike | null = null;

  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  private sseWatchdogTimer: ReturnType<typeof setInterval> | null = null;

  private lastModeSwitchAt = 0;

  private pollSuccessStreak = 0;

  private lastSseActivityAt = 0;

  constructor(options: TimelineTransportOptions) {
    this.options = {
      ...options,
      pollIntervalMs: options.pollIntervalMs ?? 1500,
      sseStaleMs: options.sseStaleMs ?? 15_000,
      minModeDwellMs: options.minModeDwellMs ?? 8_000,
      recoverAfterPollSuccesses: options.recoverAfterPollSuccesses ?? 3,
      initialCursor: options.initialCursor ?? 0,
    };
    this.cursor = this.options.initialCursor;
  }

  start(): void {
    if (this.stopped) return;
    if (!this.options.baseUrl) {
      this.updateStatus('closed', 'idle');
      return;
    }

    if (this.hasSseSupport()) {
      this.startSse(false);
      return;
    }

    this.startPolling('degraded');
  }

  stop(): void {
    this.stopped = true;
    this.clearPollTimer();
    this.stopSseWatchdog();
    this.closeEventSource();
    this.updateStatus('closed', 'idle');
  }

  async syncNow(): Promise<void> {
    if (this.stopped || !this.options.baseUrl) return;
    await this.pollOnce(false);
  }

  private hasSseSupport(): boolean {
    const ctor = (globalThis as unknown as { EventSource?: EventSourceCtor }).EventSource;
    return typeof ctor === 'function';
  }

  private getEventSourceCtor(): EventSourceCtor | null {
    const ctor = (globalThis as unknown as { EventSource?: EventSourceCtor }).EventSource;
    return typeof ctor === 'function' ? ctor : null;
  }

  private updateStatus(state: TimelineTransportState, mode: TimelineTransportMode = this.mode): void {
    this.state = state;
    this.mode = mode;
    this.options.onStatus?.(state, mode);
  }

  private updateCursor(nextCursor: number): void {
    if (nextCursor <= this.cursor) return;
    this.cursor = nextCursor;
    this.options.onCursor?.(nextCursor);
  }

  private recordModeSwitch(mode: TimelineTransportMode): void {
    this.mode = mode;
    this.lastModeSwitchAt = now();
  }

  private canSwitchMode(): boolean {
    if (this.lastModeSwitchAt === 0) return true;
    return now() - this.lastModeSwitchAt >= this.options.minModeDwellMs;
  }

  private startSse(isRecovering: boolean): void {
    if (this.stopped) return;

    const EventSourceImpl = this.getEventSourceCtor();
    if (!EventSourceImpl) {
      this.startPolling('degraded');
      return;
    }

    this.clearPollTimer();
    this.closeEventSource();
    this.stopSseWatchdog();

    this.recordModeSwitch('sse');
    this.pollSuccessStreak = 0;
    this.lastSseActivityAt = now();
    this.updateStatus(isRecovering ? 'recovering' : 'connecting', 'sse');

    const streamUrl = `${this.options.baseUrl}/v0/stream?sessionId=${encodeURIComponent(this.options.sessionId)}&cursor=${this.cursor}`;
    const es = new EventSourceImpl(streamUrl);
    this.eventSource = es;

    es.onopen = () => {
      if (this.stopped || this.eventSource !== es) return;
      this.lastSseActivityAt = now();
      this.updateStatus('open', 'sse');
      this.startSseWatchdog();
    };

    es.onmessage = (message) => {
      if (this.stopped || this.eventSource !== es) return;
      this.lastSseActivityAt = now();
      const parsed = this.parseEnvelope(message.data);
      if (!parsed) return;
      this.options.onEvents([parsed]);
      this.updateCursor(parsed.seq);
    };

    es.onerror = () => {
      if (this.stopped || this.eventSource !== es) return;
      this.options.onError?.('sse stream error');
      this.fallbackToPolling();
    };
  }

  private startSseWatchdog(): void {
    this.stopSseWatchdog();
    this.sseWatchdogTimer = setInterval(() => {
      if (this.stopped || this.mode !== 'sse') return;
      if (now() - this.lastSseActivityAt > this.options.sseStaleMs) {
        this.options.onError?.('sse stale timeout');
        this.fallbackToPolling();
      }
    }, 3000);
  }

  private stopSseWatchdog(): void {
    if (!this.sseWatchdogTimer) return;
    clearInterval(this.sseWatchdogTimer);
    this.sseWatchdogTimer = null;
  }

  private closeEventSource(): void {
    if (!this.eventSource) return;
    try {
      this.eventSource.close();
    } catch {
      // ignore close error
    }
    this.eventSource = null;
  }

  private parseEnvelope(raw: string | undefined): TimelineEvent | null {
    if (!raw) return null;
    let parsed: TimelineEventEnvelope;
    try {
      parsed = JSON.parse(raw) as TimelineEventEnvelope;
    } catch {
      return null;
    }
    if (!parsed || parsed.type !== 'timeline_event' || !parsed.event) return null;
    return parsed.event;
  }

  private fallbackToPolling(): void {
    this.closeEventSource();
    this.stopSseWatchdog();
    this.startPolling('degraded');
  }

  private startPolling(state: TimelineTransportState): void {
    if (this.stopped) return;
    this.recordModeSwitch('polling');
    this.updateStatus(state, 'polling');
    this.clearPollTimer();
    void this.pollLoop();
  }

  private clearPollTimer(): void {
    if (!this.pollTimer) return;
    clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  private async pollLoop(): Promise<void> {
    if (this.stopped || this.mode !== 'polling') return;
    await this.pollOnce(true);
    if (this.stopped || this.mode !== 'polling') return;
    this.pollTimer = setTimeout(() => {
      void this.pollLoop();
    }, this.options.pollIntervalMs);
  }

  private async pollOnce(allowRecover: boolean): Promise<void> {
    const url = `${this.options.baseUrl}/v0/timeline?sessionId=${encodeURIComponent(this.options.sessionId)}&cursor=${this.cursor}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.pollSuccessStreak = 0;
        this.options.onError?.(`timeline poll failed:${response.status}`);
        return;
      }

      const payload = (await response.json()) as {
        events?: TimelineEvent[];
        nextCursor?: number;
      };
      const events = payload.events || [];
      if (events.length > 0) {
        this.options.onEvents(events);
      }

      if (typeof payload.nextCursor === 'number') {
        this.updateCursor(payload.nextCursor);
      } else if (events.length > 0) {
        const maxSeq = events.reduce((max, event) => Math.max(max, event.seq), this.cursor);
        this.updateCursor(maxSeq);
      }

      if (this.mode === 'polling') {
        this.pollSuccessStreak += 1;
        if (allowRecover && this.hasSseSupport() && this.pollSuccessStreak >= this.options.recoverAfterPollSuccesses && this.canSwitchMode()) {
          this.startSse(true);
        } else if (this.state !== 'degraded') {
          this.updateStatus('degraded', 'polling');
        }
      }
    } catch {
      this.pollSuccessStreak = 0;
      this.options.onError?.('timeline poll exception');
    }
  }
}

