# Legacy Removal Ledger

## Database targets

The following legacy-only tables are scheduled for destructive removal by `prisma/migrations/20260314130500_drop_legacy_v0_tables/migration.sql`:

- `sessions`
- `timeline_events`
- `provider_runs`
- `task_threads`
- `user_context_cache`

## Repo assets removed during T-037

- `apps/gateway`
- `apps/frontend`
- `apps/adapter-wechat`
- `apps/provider-sample`
- `packages/contracts`
- compat executor client and registry exports in `packages/executor-sdk`
- legacy staging/deploy/packaging manifests under `ops/deploy/**` and `ops/packaging/**`

## Repo assets retained

- `outbox_events`
- pure-`v1` workflow, governance, connector, bridge, and worker services
- `apps/executor-bridge-sample` as dev/test-only sample

## Implementation note

This ledger records the repo-side cutover plus the executed local backup snapshot. The actual export evidence now lives under `artifacts/legacy-backup/export/` and `artifacts/legacy-backup/export-manifest.json`.
