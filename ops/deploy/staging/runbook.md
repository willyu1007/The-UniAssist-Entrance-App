# Staging Release Runbook

## Scope

- Services: `gateway`, `worker`, `provider-plan`, `adapter-wechat`
- Dependencies: Postgres, Redis

## Prerequisites

1. Load staging env variables from `ops/deploy/staging/env.example`.
2. Ensure Postgres and Redis are reachable.
3. Ensure target release revision is tagged and reproducible.

## Pre-release gate (must pass)

```bash
DATABASE_URL=... REDIS_URL=... pnpm release:gate:staging
```

Gate content:
- `pnpm typecheck:workspaces`
- `pnpm test:conformance`
- `pnpm smoke:redis:e2e`

If any step fails: stop rollout and fix before retry.

## Rollout order

1. Deploy `provider-plan`
2. Deploy `adapter-wechat`
3. Deploy `gateway`
4. Deploy `worker`

After each step, check `/health` endpoint of updated service.

## Post-release verification

```bash
STAGING_GATEWAY_BASE_URL=... \
STAGING_PROVIDER_PLAN_BASE_URL=... \
STAGING_ADAPTER_WECHAT_BASE_URL=... \
STAGING_CONTEXT_TOKEN=... \
pnpm release:verify:staging
```

Verification criteria:
- health endpoints all green
- one ingest request accepted
- timeline contains routing + provider run + interaction events
- context API authorization path works (if token provided)

## Rollback target (< 15 minutes)

Trigger rollback if any of the following occurs:
- health checks fail continuously for 3 minutes
- release gate equivalent checks fail post-deploy
- dead_letter/retry metrics spike above agreed threshold

Rollback steps:
1. Stop new worker instances first (prevent additional write/consume drift).
2. Revert `gateway/provider-plan/adapter-wechat/worker` to previous stable revision.
3. Re-apply previous env set and restart in rollout order.
4. Re-run post-release verification command.
5. Record incident timeline and root cause.

## Evidence checklist

- Gate output log attached
- Post-release verification output attached
- Release revision and rollback revision recorded
- Incident note (if rollback happened)
