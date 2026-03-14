# 03 Implementation Notes

## Initial note
- `T-037` is intentionally destructive and must run last.
- It turns the planning promise of “no semantic drift remains” into an enforceable repo state.

## Landed in repo
- removed legacy workspaces:
  - `apps/gateway`
  - `apps/frontend`
  - `apps/adapter-wechat`
  - `apps/provider-sample`
  - `packages/contracts`
- removed compat executor client and registry exports from `packages/executor-sdk`
- normalized `packages/workflow-contracts` and surviving runtime/platform/worker code to pure-`v1` type names
- changed workspace identity from `@baseinterface/*` to `@uniassist/*`
- switched root/dev entrypoints, packaging, deploy manifests, staging runbook, and alert drill to pure-`v1` services
- rewrote remaining active-path residue in ops docs and worker checks to stop describing the current platform in gateway-era terms
- moved the pre-cutover internal-security E2E report into the archived `T-006` task bundle so active ops report paths only carry current release/drill evidence
- removed legacy Prisma SSOT models:
  - `sessions`
  - `timeline_events`
  - `provider_runs`
  - `task_threads`
  - `user_context_cache`
- added repo-side migration `20260314130500_drop_legacy_v0_tables`
- added an explicit repo-side `grep:pure-v1` gate for active code/docs/task bundles

## Responsibility contract
- predecessor tasks must prove pure-`v1` replacement exists
- this task then removes old artifacts and cleans remaining identity drift

## Expected repo landing
- legacy service/module roots
- old contracts packages
- docs and scripts carrying compat semantics
- workspace metadata and package names

## Review closure
- This package now explicitly distinguishes:
  - what must be deleted or rewritten
  - what may remain only as historical residue
  - what must be proven before deletion starts
- The review confirmed the cleanup scope is not hypothetical. Active repo evidence already exists in:
  - repo-level docs
  - gateway and frontend legacy modules
  - contracts and executor SDK compat helpers
  - sample scenario helpers and tests
- The package also now carries a hard rule for final signoff:
  - if forbidden legacy terms still exist in active paths, the rewrite is not complete even if the code runs

## Implementation guardrails for later
- Do not leave repo-level docs for “later” after deleting code; documentation drift is part of the cleanup task.
- Do not keep compat package names because they are convenient for import stability.
- Do not allow active tests to preserve deleted semantics under the label of regression coverage.
- Do not mark backup/export as complete unless artifact files and checksums come from a real database snapshot.

## Backup execution note
- The backup/export step was executed against local PostgreSQL snapshots on `2026-03-14`.
- Source drift exists in the local legacy footprint:
  - `sessions`, `timeline_events`, `provider_runs`, `user_context_cache` were exported from `uniassist_gateway`
  - `task_threads` was absent in `uniassist_gateway` and was exported from `postgres`
- The artifact ledger now records the actual row counts, checksums, and source databases rather than a blocked placeholder.
