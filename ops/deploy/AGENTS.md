# Deploy - AI Guidance

## Conclusions (read first)

- `ops/deploy/` contains environment runbooks and release verification scripts.
- Staging gate and post-deploy expectations are defined in `ops/deploy/README.md` and the staging runbook; keep AI edits aligned with those human-facing policies.

## AI Workflow

1. Update `ops/deploy/staging/env.example` when required vars change.
2. Keep `ops/deploy/staging/runbook.md` aligned with executable scripts.
3. Add or update scripts under `ops/deploy/scripts/`.
4. Record validation evidence in task verification docs.
