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

## Execution-stage verification
- `pnpm --filter @uniassist/workflow-contracts typecheck`
  - Status: passed
  - Notes:
    - shared template list/detail DTOs compile as part of the contracts package
- `pnpm --filter @uniassist/workflow-platform-api typecheck`
  - Status: passed
- `pnpm --filter @uniassist/workflow-platform-api test`
  - Status: passed
  - Notes:
    - existing integration coverage for `/v1/workflows` list/detail was updated with explicit assertions on shared template fields
- `pnpm --filter @uniassist/control-console typecheck`
  - Status: passed
- `pnpm --filter @uniassist/control-console test`
  - Status: passed
  - Notes:
    - route smoke now covers the 6 primary operator domains
    - debug/manual run launch is covered from `Templates`
    - agent create, activate, and production run start are covered from `Agents`
    - capability create + bridge lifecycle actions are covered from `Capabilities`
    - governance request create/approve/reject flows are covered from `Governance`
    - existing run, approval, artifact, and studio tests remain green
- `pnpm typecheck:workspaces`
  - Status: passed
  - Notes:
    - workspace verification required a minimal compatibility fix in `apps/gateway`
    - `ingest-route` and `interact-route` now source provider identity from gateway context instead of removed workflow run fields
    - legacy draft intake source values were aligned to the current `DraftSource` enum
