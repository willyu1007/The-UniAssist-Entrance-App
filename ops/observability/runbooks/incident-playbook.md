# UniAssist Incident Playbook (Staging)

## Triage checklist

1. Confirm alert identity, severity, and duration.
2. Pull latest gateway metrics: `/metrics` and `/v0/metrics`.
3. Correlate with structured logs (`service`, `traceId`, `sessionId`, `runId`).
4. Decide mitigate vs rollback using staging runbook criteria.

## P1: Gateway ingest error rate high

- Verify:
  - `uniassist_gateway_ingest_error_rate`
  - recent 4xx/5xx logs by `service=gateway`
- Actions:
  - Check dependency reachability (Postgres/Redis/provider).
  - If sustained >5 min, execute rollback steps from deploy runbook.
- Exit criteria:
  - error rate <2% for 10 min.

## P2: Gateway ingest latency high

- Verify:
  - `uniassist_gateway_ingest_latency_p95_ms`
  - outbox backlog and provider errors
- Actions:
  - Identify hot path (routing/persistence/provider).
  - Reduce traffic and evaluate rollback if p95 >1500ms sustained.
- Exit criteria:
  - p95 latency <1000ms for 15 min.

## P1: Outbox backlog high

- Verify:
  - `uniassist_outbox_backlog_total`
  - `uniassist_outbox_oldest_backlog_age_ms`
- Actions:
  - Confirm worker liveness and Redis connectivity.
  - Restart worker with latest stable revision.
  - If still rising, rollback gateway+worker.
- Exit criteria:
  - backlog trend downward, oldest backlog age decreasing.

## P1: Dead-letter detected

- Verify:
  - `uniassist_outbox_dead_letter_total`
  - inspect sample `outbox_events` rows for `last_error`
- Actions:
  - Stop rollout.
  - Analyze root cause and replay only after fix.
- Exit criteria:
  - dead-letter no longer increasing and replay succeeds.

## P2: Provider invoke errors high

- Verify:
  - `increase(uniassist_gateway_provider_invoke_error_total[10m])`
  - provider health endpoint and logs
- Actions:
  - isolate impacted provider route if possible.
  - fallback to builtin flow until provider recovers.
- Exit criteria:
  - invoke errors return to baseline.
