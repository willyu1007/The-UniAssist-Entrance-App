# Observability

Baseline observability assets for UniAssist services.

## Scope

- structured logging conventions
- metrics endpoint contracts
- alert rule drafts (staging first)
- incident handling runbooks

## Metrics source

Current runtime metrics are exposed by gateway:
- `GET /v0/metrics` (JSON)
- `GET /metrics` (Prometheus text)

## Alerts

Staging rule draft:
- `ops/observability/alerts/staging.rules.yml`

Rule validation command:

```bash
pnpm observability:alerts:validate
```

Staging drill command (table-top + simulated firing):

```bash
STAGING_GATEWAY_BASE_URL=http://localhost:8787 \
pnpm observability:drill:staging
```

Output report:
- `ops/observability/reports/staging-drill-latest.md`

Staging integration templates:
- `ops/observability/staging/prometheus.rules.load.example.yml`
- `ops/observability/staging/alertmanager.receivers.example.yml`

## Operations

Primary incident playbook:
- `ops/observability/runbooks/incident-playbook.md`
