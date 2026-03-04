import type { OutboxMetricsSnapshot } from './persistence';

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank] || 0;
}

export class GatewayObservability {
  private readonly startedAtMs = Date.now();

  private ingestTotal = 0;

  private ingestErrorTotal = 0;

  private readonly ingestLatencyRecent: number[] = [];

  private providerInvokeErrorTotal = 0;

  private providerInteractErrorTotal = 0;

  private persistenceErrorTotal = 0;

  private readonly internalAuthRequests = new Map<string, number>();

  private readonly internalAuthDenied = new Map<string, number>();

  private readonly internalAuthReplay = new Map<string, number>();

  private readonly maxLatencySamples = 1024;

  private incMap(target: Map<string, number>, key: string): void {
    const value = target.get(key) || 0;
    target.set(key, value + 1);
  }

  private mapToEntries(
    source: Map<string, number>,
    parser: (key: string) => Record<string, string>,
  ): Array<Record<string, string | number>> {
    return [...source.entries()].map(([key, value]) => ({
      ...parser(key),
      value,
    }));
  }

  private static toPromLabel(labels: Record<string, string>): string {
    const entries = Object.entries(labels).map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`);
    return entries.join(',');
  }

  observeIngest(statusCode: number, latencyMs: number): void {
    this.ingestTotal += 1;
    if (statusCode >= 400) {
      this.ingestErrorTotal += 1;
    }
    this.ingestLatencyRecent.push(Math.max(0, latencyMs));
    if (this.ingestLatencyRecent.length > this.maxLatencySamples) {
      this.ingestLatencyRecent.shift();
    }
  }

  observeProviderInvokeError(): void {
    this.providerInvokeErrorTotal += 1;
  }

  observeProviderInteractError(): void {
    this.providerInteractErrorTotal += 1;
  }

  observePersistenceError(): void {
    this.persistenceErrorTotal += 1;
  }

  observeInternalAuthRequest(endpoint: string, mode: 'off' | 'audit' | 'enforce', result: 'pass' | 'deny' | 'audit_allow'): void {
    this.incMap(this.internalAuthRequests, `${endpoint}|${mode}|${result}`);
  }

  observeInternalAuthDenied(endpoint: string, reason: string): void {
    this.incMap(this.internalAuthDenied, `${endpoint}|${reason}`);
  }

  observeInternalAuthReplay(endpoint: string): void {
    this.incMap(this.internalAuthReplay, endpoint);
  }

  snapshot(outbox: OutboxMetricsSnapshot | null): Record<string, unknown> {
    const p95 = percentile(this.ingestLatencyRecent, 95);
    const errorRate = this.ingestTotal > 0 ? this.ingestErrorTotal / this.ingestTotal : 0;
    const backlog = outbox ? outbox.pending + outbox.processing + outbox.failed : 0;

    return {
      startedAtMs: this.startedAtMs,
      uptimeMs: Date.now() - this.startedAtMs,
      ingest: {
        total: this.ingestTotal,
        errorTotal: this.ingestErrorTotal,
        errorRate: Number(errorRate.toFixed(6)),
        latencyP95Ms: Number(p95.toFixed(3)),
      },
      provider: {
        invokeErrorTotal: this.providerInvokeErrorTotal,
        interactErrorTotal: this.providerInteractErrorTotal,
      },
      persistence: {
        errorTotal: this.persistenceErrorTotal,
      },
      internalAuth: {
        requests: this.mapToEntries(this.internalAuthRequests, (key) => {
          const [endpoint = 'unknown', mode = 'off', result = 'pass'] = key.split('|');
          return { endpoint, mode, result };
        }),
        denied: this.mapToEntries(this.internalAuthDenied, (key) => {
          const [endpoint = 'unknown', reason = 'unknown'] = key.split('|');
          return { endpoint, reason };
        }),
        replay: this.mapToEntries(this.internalAuthReplay, (key) => ({ endpoint: key })),
      },
      outbox: outbox
        ? {
            ...outbox,
            backlogTotal: backlog,
          }
        : null,
    };
  }

  toPrometheus(outbox: OutboxMetricsSnapshot | null): string {
    const p95 = percentile(this.ingestLatencyRecent, 95);
    const errorRate = this.ingestTotal > 0 ? this.ingestErrorTotal / this.ingestTotal : 0;
    const backlog = outbox ? outbox.pending + outbox.processing + outbox.failed : 0;

    const lines = [
      '# HELP uniassist_gateway_ingest_total Total ingest requests observed by gateway.',
      '# TYPE uniassist_gateway_ingest_total counter',
      `uniassist_gateway_ingest_total ${this.ingestTotal}`,
      '# HELP uniassist_gateway_ingest_error_total Total ingest errors (status >= 400).',
      '# TYPE uniassist_gateway_ingest_error_total counter',
      `uniassist_gateway_ingest_error_total ${this.ingestErrorTotal}`,
      '# HELP uniassist_gateway_ingest_error_rate Current ingest error rate.',
      '# TYPE uniassist_gateway_ingest_error_rate gauge',
      `uniassist_gateway_ingest_error_rate ${errorRate}`,
      '# HELP uniassist_gateway_ingest_latency_p95_ms Ingest latency P95 in milliseconds (recent window).',
      '# TYPE uniassist_gateway_ingest_latency_p95_ms gauge',
      `uniassist_gateway_ingest_latency_p95_ms ${p95}`,
      '# HELP uniassist_gateway_provider_invoke_error_total Provider invoke errors observed by gateway.',
      '# TYPE uniassist_gateway_provider_invoke_error_total counter',
      `uniassist_gateway_provider_invoke_error_total ${this.providerInvokeErrorTotal}`,
      '# HELP uniassist_gateway_provider_interact_error_total Provider interact errors observed by gateway.',
      '# TYPE uniassist_gateway_provider_interact_error_total counter',
      `uniassist_gateway_provider_interact_error_total ${this.providerInteractErrorTotal}`,
      '# HELP uniassist_gateway_persistence_error_total Persistence errors observed by gateway.',
      '# TYPE uniassist_gateway_persistence_error_total counter',
      `uniassist_gateway_persistence_error_total ${this.persistenceErrorTotal}`,
      '# HELP uniassist_internal_auth_requests_total Internal auth requests by endpoint/mode/result.',
      '# TYPE uniassist_internal_auth_requests_total counter',
      ...[...this.internalAuthRequests.entries()].map(([key, value]) => {
        const [endpoint = 'unknown', mode = 'off', result = 'pass'] = key.split('|');
        const labels = GatewayObservability.toPromLabel({
          service: 'gateway',
          endpoint,
          mode,
          result,
        });
        return `uniassist_internal_auth_requests_total{${labels}} ${value}`;
      }),
      '# HELP uniassist_internal_auth_denied_total Internal auth denied counts by endpoint/reason.',
      '# TYPE uniassist_internal_auth_denied_total counter',
      ...[...this.internalAuthDenied.entries()].map(([key, value]) => {
        const [endpoint = 'unknown', reason = 'unknown'] = key.split('|');
        const labels = GatewayObservability.toPromLabel({
          service: 'gateway',
          endpoint,
          reason,
        });
        return `uniassist_internal_auth_denied_total{${labels}} ${value}`;
      }),
      '# HELP uniassist_internal_auth_replay_total Internal auth replay detections by endpoint.',
      '# TYPE uniassist_internal_auth_replay_total counter',
      ...[...this.internalAuthReplay.entries()].map(([endpoint, value]) => {
        const labels = GatewayObservability.toPromLabel({
          service: 'gateway',
          endpoint,
        });
        return `uniassist_internal_auth_replay_total{${labels}} ${value}`;
      }),
      '# HELP uniassist_outbox_backlog_total Outbox rows waiting for completion.',
      '# TYPE uniassist_outbox_backlog_total gauge',
      `uniassist_outbox_backlog_total ${backlog}`,
      '# HELP uniassist_outbox_pending_total Outbox rows in pending status.',
      '# TYPE uniassist_outbox_pending_total gauge',
      `uniassist_outbox_pending_total ${outbox?.pending ?? 0}`,
      '# HELP uniassist_outbox_processing_total Outbox rows in processing status.',
      '# TYPE uniassist_outbox_processing_total gauge',
      `uniassist_outbox_processing_total ${outbox?.processing ?? 0}`,
      '# HELP uniassist_outbox_failed_total Outbox rows in failed status.',
      '# TYPE uniassist_outbox_failed_total gauge',
      `uniassist_outbox_failed_total ${outbox?.failed ?? 0}`,
      '# HELP uniassist_outbox_dead_letter_total Outbox rows in dead_letter status.',
      '# TYPE uniassist_outbox_dead_letter_total gauge',
      `uniassist_outbox_dead_letter_total ${outbox?.deadLetter ?? 0}`,
      '# HELP uniassist_outbox_retry_rows_total Outbox rows retried at least once.',
      '# TYPE uniassist_outbox_retry_rows_total gauge',
      `uniassist_outbox_retry_rows_total ${outbox?.retryRows ?? 0}`,
      '# HELP uniassist_outbox_attempts_total Total outbox attempts persisted.',
      '# TYPE uniassist_outbox_attempts_total gauge',
      `uniassist_outbox_attempts_total ${outbox?.attemptsTotal ?? 0}`,
      '# HELP uniassist_outbox_oldest_backlog_age_ms Oldest unfinished outbox event age in milliseconds.',
      '# TYPE uniassist_outbox_oldest_backlog_age_ms gauge',
      `uniassist_outbox_oldest_backlog_age_ms ${outbox?.oldestBacklogAgeMs ?? 0}`,
    ];

    return `${lines.join('\n')}\n`;
  }
}
