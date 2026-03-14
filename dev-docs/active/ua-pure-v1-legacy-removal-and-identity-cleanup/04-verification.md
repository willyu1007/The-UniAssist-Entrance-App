# 04 Verification

## Repo-side cutover
- Status: passed
- Evidence:
  - legacy workspaces removed from filesystem:
    - `apps/gateway`
    - `apps/frontend`
    - `apps/adapter-wechat`
    - `apps/provider-sample`
    - `packages/contracts`
  - pure-`v1` replacements now own default dev/deploy topology:
    - `control-console`
    - `workflow-platform-api`
    - `workflow-runtime`
    - `connector-runtime`
    - `trigger-scheduler`
    - `worker`

## Prisma cutover
- Status: passed (repo-side)
- Evidence:
  - `prisma/schema.prisma` no longer declares `sessions`, `timeline_events`, `provider_runs`, `task_threads`, `user_context_cache`
  - migration added:
    - `prisma/migrations/20260314130500_drop_legacy_v0_tables/migration.sql`
- Notes:
  - destructive apply against a shared/live target remains environment-owned; repo migration, schema refresh, and local backup evidence are complete

## Backup artifact ledger
- Status: passed
- Evidence:
  - `artifacts/legacy-backup/README.md`
  - `artifacts/legacy-backup/export-manifest.json`
  - `artifacts/legacy-backup/removal-ledger.md`
  - `artifacts/legacy-backup/export/row-counts.tsv`
  - `artifacts/legacy-backup/export/checksums.sha256`
  - `artifacts/legacy-backup/export/*.csv`
- Notes:
  - local backup export executed with direct `psql` connections to local PostgreSQL on `127.0.0.1:5432`
  - source DB mapping is explicit because the local legacy footprint was split:
    - `sessions`, `timeline_events`, `provider_runs`, `user_context_cache` from `uniassist_gateway`
    - `task_threads` from `postgres`

## Execution-stage verification
- Status: passed
- Evidence:
  - `pnpm install`
  - workspace typecheck:
    - `pnpm --filter @uniassist/workflow-contracts typecheck`
    - `pnpm --filter @uniassist/executor-sdk typecheck`
    - `pnpm --filter @uniassist/connector-sdk typecheck`
    - `pnpm --filter @uniassist/executor-bridge-sample typecheck`
  - workspace tests:
    - `pnpm --filter @uniassist/workflow-runtime test`
    - `pnpm --filter @uniassist/workflow-platform-api test`
    - `pnpm --filter @uniassist/control-console test`
    - `pnpm --filter @uniassist/worker test`
    - `pnpm --filter @uniassist/connector-runtime test`
    - `pnpm --filter @uniassist/trigger-scheduler test`
  - DB/context/governance:
    - `DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/uniassist pnpm prisma validate`
    - `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`
    - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
    - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
  - deployment/grep gate:
    - `pnpm k8s:staging:validate`
    - final forbidden-term grep against active paths returned clean
