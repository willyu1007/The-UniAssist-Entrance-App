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

## Active-path residue cleanup
- Status: passed
- Evidence:
  - `ops/observability/README.md` now documents the shared metrics surface in terms of the pure-`v1` service topology
  - `apps/worker/src/worker.ts` and `apps/worker/tests/worker.test.ts` no longer describe the current runtime as a gateway-era projection path
  - the pre-cutover internal-security E2E report was relocated from `ops/deploy/reports/t006-e2e-evidence-2026-03-04.md` to `dev-docs/archive/ua-v1-internal-security/artifacts/t006-e2e-evidence-2026-03-04.md`
- Notes:
  - `ops/deploy/reports/` remains reserved for current deployment/drill evidence such as staging verification output

## Prisma cutover
- Status: passed (repo-side)
- Evidence:
  - `prisma/schema.prisma` no longer declares `sessions`, `timeline_events`, `provider_runs`, `task_threads`, `user_context_cache`
  - migration added:
    - `prisma/migrations/20260314130500_drop_legacy_v0_tables/migration.sql`
- Notes:
  - destructive apply against a shared/live target remains environment-owned; repo migration, schema refresh, and local backup evidence are complete
  - the repository currently exposes only placeholder/staging DB coordinates, not shared/live credentials, so the final remote apply could not be executed from repo context alone

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
    - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`
  - deployment/grep gate:
    - `pnpm k8s:staging:validate`
    - `pnpm grep:pure-v1`
    - grep scope excludes archive paths, `ops/deploy/reports/**`, migration history, and the active `T-037` working bundle that still records the removal ledger

## 2026-03-14 repo-side residue cleanup revalidation
- Status: passed
- Evidence:
  - `pnpm grep:pure-v1`
  - `pnpm smoke:pure-v1`
  - `pnpm k8s:staging:validate`
  - `DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/uniassist pnpm prisma validate`
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Notes:
  - all repo-side gates remained green after relocating the pre-cutover report and rewriting active-path wording
  - shared/live destructive apply is still pending because the repository only carries placeholder or staging DB coordinates, not environment-owner credentials for the final target
