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

## Operations

Primary incident playbook:
- `ops/observability/runbooks/incident-playbook.md`
