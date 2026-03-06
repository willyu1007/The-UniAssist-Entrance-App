import type { InteractionEvent, TimelineEvent } from '@baseinterface/contracts';

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseInteractionFromPayload(payload: Record<string, unknown>): InteractionEvent | null {
  const maybeEvent = payload.event;
  if (!maybeEvent || typeof maybeEvent !== 'object') return null;
  const casted = maybeEvent as { type?: string };
  if (!casted.type) return null;
  return maybeEvent as InteractionEvent;
}

export function sourceLabel(event: TimelineEvent, payload: Record<string, unknown>): string {
  const source = typeof payload.source === 'string' ? payload.source : undefined;
  if (event.providerId && source) return `${event.providerId} · ${source}`;
  if (event.providerId) return event.providerId;
  if (source) return source;
  return 'engine';
}
