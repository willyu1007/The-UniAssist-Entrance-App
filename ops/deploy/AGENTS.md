# Deploy - AI Guidance

## Conclusions (read first)

- `ops/deploy/` contains environment runbooks and release verification scripts.
- Staging release gate must include:
  - `pnpm test:conformance`
  - `pnpm smoke:redis:e2e`
- Post-deploy checks should validate health endpoints and at least one ingest->timeline path.

## AI Workflow

1. Update `ops/deploy/staging/env.example` when required vars change.
2. Keep `ops/deploy/staging/runbook.md` aligned with executable scripts.
3. Add or update scripts under `ops/deploy/scripts/`.
4. Record validation evidence in task verification docs.
