# Observability

This directory holds the baseline observability contract, alert drafts, and incident runbooks for the repository.

## Non-obvious Notes

- Gateway currently exposes the shared baseline metrics surface; other services should extend the same operational model instead of inventing disconnected conventions.
- Alert assets here are staging-first baselines, not a claim of full production coverage.
- Drill output is generated under `ops/observability/reports/` when the drill runs and may not always be committed.
- When alerts or metrics change, update the runbook expectations alongside them.
