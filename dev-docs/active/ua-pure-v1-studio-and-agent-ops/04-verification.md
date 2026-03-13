# 04 Verification

## Planning bundle review
- Status: passed
- Evidence:
  - `01-plan.md` now defines operator personas, route groups, proof loop, and projection constraints
  - `02-architecture.md` now defines operator action classes, governance/capability surfaces, API boundaries, and non-goal boundaries

## Current repo operator-surface scan
- Status: passed
- Command:
  - `rg -n "bridge|connector|policy|secret|scope|governance-change" apps/control-console/src`
  - `rg -n "bridge-registrations|connector-definitions|connector-bindings|policy-bindings|secret-refs|scope-grants|governance-change-requests" apps/workflow-platform-api/src/server.ts`
- Notes:
  - confirmed:
    - control-console already consumes `workflow-platform-api`
    - operator APIs for drafts, agents, runs, approvals, and artifacts already exist in part
    - governance and external capability APIs already exist in `workflow-platform-api`
    - control-console currently lacks comparable coverage for those governance and external capability objects
    - draft intake and synthesize endpoints remain and need explicit pure-`v1` interpretation or removal

## Package-closure review
- Status: passed
- Notes:
  - `T-035` now has a bounded operator surface that depends on `T-034` kernel semantics without reopening them, while also covering the minimal connector/bridge/governance management needed to operate pure-`v1`.

## Execution-stage verification to record later
- control-console typecheck/build/test
- route smoke tests
- API integration tests for operator mutations
- manual/debug run smoke tests
