import type { ContextPackage, RoutingCandidate, UnifiedUserInput } from '@baseinterface/contracts';
import { ROUTE_THRESHOLD, STICKY_DECAY_PER_TURN, TOPIC_DRIFT_THRESHOLD } from './gateway-config';
import type { ProviderRegistryEntry, SessionState } from './gateway-types';

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function jaccard(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  const inter = [...ta].filter((x) => tb.has(x)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}

export function scoreCandidates(
  session: SessionState,
  input: UnifiedUserInput,
  providerRegistry: Map<string, ProviderRegistryEntry>,
): RoutingCandidate[] {
  const text = input.text || '';
  const lowered = text.toLowerCase();

  const scored = [...providerRegistry.values()]
    .filter((provider) => provider.enabled && Boolean(provider.baseUrl))
    .map((provider) => {
      let score = 0;
      let hitCount = 0;

      for (const keyword of provider.keywords) {
        if (lowered.includes(keyword)) {
          hitCount += 1;
        }
      }

      if (hitCount > 0) {
        score = Math.min(0.95, 0.45 + hitCount * 0.18);
      }

      if (session.stickyProviderId === provider.providerId) {
        score += session.stickyScoreBoost;
      }

      return {
        providerId: provider.providerId,
        score: Number(score.toFixed(3)),
        reason: hitCount > 0 ? `matched_keywords:${hitCount}` : 'no-keyword-match',
        requiresClarification: score > 0 && score < ROUTE_THRESHOLD,
        suggestedMode: 'async' as const,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored;
}

export function updateTopicDrift(session: SessionState, input: UnifiedUserInput): boolean {
  const text = (input.text || '').trim();
  if (!text) return false;

  if (!session.lastUserText) {
    session.lastUserText = text;
    return false;
  }

  const similarity = jaccard(session.lastUserText, text);
  session.lastUserText = text;

  if (similarity < TOPIC_DRIFT_THRESHOLD) {
    session.topicDriftStreak += 1;
  } else {
    session.topicDriftStreak = 0;
  }

  return session.topicDriftStreak >= 2;
}

export function updateStickySignals(
  session: SessionState,
  candidates: RoutingCandidate[],
): { suggestSwitchTo?: string } {
  session.stickyScoreBoost = Math.max(0, Number((session.stickyScoreBoost - STICKY_DECAY_PER_TURN).toFixed(3)));

  if (!session.stickyProviderId || candidates.length === 0) {
    return {};
  }

  const sticky = candidates.find((c) => c.providerId === session.stickyProviderId);
  const leader = candidates[0];

  if (!sticky || !leader || leader.providerId === sticky.providerId) {
    session.switchLeadProviderId = undefined;
    session.switchLeadStreak = 0;
    return {};
  }

  if (leader.score - sticky.score >= 0.15) {
    if (session.switchLeadProviderId === leader.providerId) {
      session.switchLeadStreak += 1;
    } else {
      session.switchLeadProviderId = leader.providerId;
      session.switchLeadStreak = 1;
    }
  } else {
    session.switchLeadProviderId = undefined;
    session.switchLeadStreak = 0;
  }

  if (session.switchLeadStreak >= 2 && session.switchLeadProviderId) {
    return { suggestSwitchTo: session.switchLeadProviderId };
  }

  return {};
}

export function buildFallbackReply(input: UnifiedUserInput): string {
  const text = input.text?.trim();
  if (!text) {
    return '我先作为通用助手接住这条消息。你可以继续补充目标，我会再尝试分发到专项能力。';
  }
  return `当前未命中专项能力，我先继续协助你：${text}`;
}

export function buildContextPackage(input: UnifiedUserInput, session: SessionState): ContextPackage {
  return {
    schemaVersion: 'v0',
    user: {
      userId: input.userId,
      locale: input.locale,
      timezone: input.timezone,
    },
    profileSnapshot: {
      displayName: input.userId,
    },
    profileRef: `profile:${input.userId}`,
    permissions: ['context:read'],
    session: {
      sessionId: session.sessionId,
      recentEventsCursor: session.seq,
    },
  };
}
