# Deploy

Deployment assets and runbooks live here.

## Non-obvious Rules

- Rollout and rollback remain human-owned decisions even when scripts automate validation.
- The staging release gate is expected to include `pnpm test:conformance` and `pnpm smoke:redis:e2e`.
- Post-deploy verification must cover health plus at least one ingest-to-timeline path, not just readiness probes.
- Prefer the repo-level deployment scripts over ad-hoc manual flows when validating kind or staging overlays.

For environment-specific details, read `ops/deploy/staging/runbook.md` and `ops/deploy/staging/env.example`.
