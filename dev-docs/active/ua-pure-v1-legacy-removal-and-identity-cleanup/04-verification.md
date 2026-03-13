# 04 Verification

## Planning bundle review
- Status: passed
- Evidence:
  - `01-plan.md` now defines:
    - admission criteria
    - destructive sequencing
    - final grep gate
  - `02-architecture.md` now defines:
    - expected target classes
    - allowed historical residue
    - final gate model

## Current repo legacy-surface scan
- Status: passed
- Command:
  - `rg -n "\\/v0|compatProviderId|WorkflowEntryRegistryEntry|replyToken|provider_run|apps/frontend|apps/gateway|packages/contracts|providerId" README.md AGENTS.md dev-docs apps packages .ai/project/main | head -n 300`
- Notes:
  - confirmed legacy semantics are still active in:
    - repo-level docs
    - gateway and frontend references
    - compat contract types
    - executor SDK compat helpers
    - active tests and scenario helpers

## Package-closure review
- Status: passed
- Notes:
  - `T-037` now defines when destructive cleanup is allowed, what can remain only as history, and how final completion will be proven.

## Execution-stage verification to record later
- backup/export evidence
- destructive removal commands
- grep gate results
- governance sync/lint after cleanup
- mainline build/test validation after cleanup
