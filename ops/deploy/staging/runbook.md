# Staging Release Runbook

## Scope

- Services: `control-console`, `workflow-platform-api`, `workflow-runtime`, `connector-runtime`, `trigger-scheduler`, `worker`
- Dependencies: Postgres, Redis

## Prerequisites

1. Load staging env variables from `ops/deploy/staging/env.example`.
2. Ensure Postgres and Redis are reachable.
3. Ensure target release revision is tagged and reproducible.
4. Internal auth rollout uses `audit -> enforce`:
   - first deployment: `UNIASSIST_INTERNAL_AUTH_MODE=audit`
   - after verification + deny log review: switch to `enforce`
5. Validate k8s overlay:
   - `pnpm k8s:staging:validate`

## Pre-release gate (must pass)

```bash
DATABASE_URL=... REDIS_URL=... pnpm release:gate:staging
```

Gate content:
- `pnpm typecheck:workspaces`
- `pnpm smoke:pure-v1`
- `pnpm --filter @uniassist/connector-runtime test`
- `pnpm --filter @uniassist/trigger-scheduler test`
- `WORKER_DRILL_MODE=simulate pnpm worker:drill:staging`

If any step fails: stop rollout and fix before retry.

## Rollout order

1. Deploy `workflow-runtime`
2. Deploy `workflow-platform-api`
3. Deploy `connector-runtime`
4. Deploy `trigger-scheduler`
5. Deploy `worker`
6. Deploy `control-console`

After each step, check `/health` endpoint of updated service.

K8s apply entry (human-run):

```bash
kubectl apply -k ops/deploy/k8s/overlays/staging
```

## Post-release verification

```bash
STAGING_CONTROL_CONSOLE_BASE_URL=... \
STAGING_WORKFLOW_PLATFORM_API_BASE_URL=... \
STAGING_WORKFLOW_RUNTIME_BASE_URL=... \
STAGING_CONNECTOR_RUNTIME_BASE_URL=... \
STAGING_TRIGGER_SCHEDULER_BASE_URL=... \
pnpm release:verify:staging
```

Verification criteria:
- control-console root responds with HTML
- pure-v1 health endpoints all green
- one draft -> validate -> publish -> run smoke path completes
- smoke run emits at least one artifact on the pure-v1 kernel

## Worker reliability drill

Table-top / simulate:

```bash
WORKER_DRILL_MODE=simulate pnpm worker:drill:staging
```

Live drill (requires staging DB + Redis access):

```bash
WORKER_DRILL_MODE=live \
DATABASE_URL=... \
REDIS_URL=... \
UNIASSIST_STREAM_PREFIX=uniassist:timeline: \
UNIASSIST_STREAM_GLOBAL_KEY=uniassist:timeline:all \
UNIASSIST_STREAM_GROUP=ua-delivery-staging \
pnpm worker:drill:staging
```

Live drill steps:
1. inject one `failed` outbox event and verify automatic recovery to `consumed`
2. destroy consumer group once (NOGROUP injection) and verify auto-recovery path
3. inject one `dead_letter` event and verify replay command restores delivery
4. replay same token again and verify idempotency (`updated=0`)

Drill evidence:
- `ops/deploy/reports/staging-worker-drill-latest.md`
- command output + start/end timestamps

## Rollback target (< 15 minutes)

Trigger rollback if any of the following occurs:
- health checks fail continuously for 3 minutes
- release gate equivalent checks fail post-deploy
- dead_letter/retry metrics spike above agreed threshold

Rollback steps:
1. Stop new worker instances first (prevent additional write/consume drift).
2. Revert `workflow-runtime/workflow-platform-api/connector-runtime/trigger-scheduler/worker/control-console` to previous stable revision.
3. Re-apply previous env set and restart in rollout order.
4. Re-run post-release verification command.
5. Record incident timeline and root cause.

## Evidence checklist

- Gate output log attached
- Post-release verification output attached
- Release revision and rollback revision recorded
- Incident note (if rollback happened)
