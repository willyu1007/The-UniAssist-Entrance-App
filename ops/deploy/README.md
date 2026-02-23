# Deploy

Goal: run packaged services/jobs in target environments with repeatable procedures.

## Structure

- `ops/deploy/staging/env.example` - baseline staging environment variables.
- `ops/deploy/staging/runbook.md` - release + verify + rollback handbook.
- `ops/deploy/scripts/staging-release-gate.mjs` - pre-release quality gate.
- `ops/deploy/scripts/staging-post-deploy-check.mjs` - post-release health and path checks.
- `ops/deploy/scripts/staging-worker-reliability-drill.mjs` - worker chaos/recovery drill (simulate/live).

## Principles

- Keep deployment steps deterministic.
- Treat rollback as a first-class path, not a fallback thought.
- Run gate checks before any rollout.
