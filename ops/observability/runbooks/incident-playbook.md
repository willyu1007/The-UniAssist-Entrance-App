# UniAssist Incident Playbook (Staging)

## Triage checklist

1. Confirm alert identity, severity, and duration.
2. Pull current health state for `control-console`, `workflow-platform-api`, `workflow-runtime`, `connector-runtime`, `trigger-scheduler`.
3. Correlate with structured logs (`service`, `traceId`, `sessionId`, `runId`).
4. Decide mitigate vs rollback using staging runbook criteria.

## Drill entry

Before real incident drills, run:

```bash
pnpm observability:alerts:validate
STAGING_CONTROL_CONSOLE_BASE_URL=<console-base-url> \
STAGING_WORKFLOW_PLATFORM_API_BASE_URL=<platform-base-url> \
STAGING_WORKFLOW_RUNTIME_BASE_URL=<runtime-base-url> \
STAGING_CONNECTOR_RUNTIME_BASE_URL=<connector-base-url> \
STAGING_TRIGGER_SCHEDULER_BASE_URL=<scheduler-base-url> \
pnpm observability:drill:staging
```

Drill report path:
- `ops/observability/reports/staging-drill-latest.md`

## P1: Workflow platform API unavailable

- Verify:
  - `kube_deployment_status_replicas_unavailable{deployment="workflow-platform-api"}`
  - recent 5xx logs by `service=workflow-platform-api`
- Actions:
  - Check dependency reachability for Postgres, Redis, and workflow-runtime.
  - If sustained >5 min, execute rollback steps from deploy runbook.
- Exit criteria:
  - deployment availability returns to steady state for 10 min.

## P1: Workflow runtime unavailable

- Verify:
  - `kube_deployment_status_replicas_unavailable{deployment="workflow-runtime"}`
  - recent 5xx logs by `service=workflow-runtime`
- Actions:
  - Check runtime pod health, database connectivity, and upstream platform retries.
  - Reduce traffic and evaluate rollback if replicas remain unavailable.
- Exit criteria:
  - deployment availability returns to steady state for 10 min.

## P1: Outbox backlog high

- Verify:
  - `uniassist_outbox_backlog_total`
  - `uniassist_outbox_oldest_backlog_age_ms`
- Actions:
  - Confirm worker liveness and Redis connectivity.
  - Restart worker with latest stable revision.
  - If still rising, rollback runtime+platform+worker.
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

## P1: Worker unavailable

- Verify:
  - `kube_deployment_status_replicas_unavailable{deployment="worker"}`
  - worker logs around outbox/consumer startup and Redis errors
- Actions:
  - restore worker deployment first to prevent backlog drift.
  - if worker remains unavailable, rollback the full runtime slice.
- Exit criteria:
  - worker deployment steady for 10 min and backlog is not increasing.

## P2: Connector runtime unavailable

- Verify:
  - `kube_deployment_status_replicas_unavailable{deployment="connector-runtime"}`
  - connector-runtime `/health` and logs
- Actions:
  - isolate connector-backed workflows or disable impacted trigger/action bindings.
  - rollback connector-runtime if issue persists.
- Exit criteria:
  - connector-runtime stable for 10 min.

## P2: Trigger scheduler unavailable

- Verify:
  - `kube_deployment_status_replicas_unavailable{deployment="trigger-scheduler"}`
  - trigger-scheduler `/health` and logs
- Actions:
  - restore scheduler deployment and confirm poll loop recovery.
  - pause affected trigger bindings if schedule drift accumulates.
- Exit criteria:
  - scheduler stable for 10 min.

## P2: Control console unavailable

- Verify:
  - `kube_deployment_status_replicas_unavailable{deployment="control-console"}`
  - control-console root responds with HTML
- Actions:
  - restore console deployment.
  - if API remains healthy, defer rollback of backend services.
- Exit criteria:
  - console steady for 10 min.
