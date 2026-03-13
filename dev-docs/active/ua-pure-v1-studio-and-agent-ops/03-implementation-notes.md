# 03 Implementation Notes

## Initial note
- `T-035` operationalizes pure-`v1` for human operators.
- It should consume `T-034` outputs, not redesign them.

## Responsibility contract
- this task may add operator-oriented query/mutation surfaces
- this task may not redefine core runtime identities or event semantics

## Expected repo landing
- `apps/control-console`
- `apps/workflow-platform-api` operator/studio endpoints
- shared UI/query utilities only when they serve the console directly

## Review closure
- This package now explicitly distinguishes:
  - operator authoring flows
  - operator capability and governance flows
  - operator runtime investigation flows
  - debug-only flows
- The review also locked one important boundary:
  - existing draft-intake or synthesize endpoints cannot automatically justify builder-style semantics in the UI
  - if they survive, they survive only as pure-`v1` authoring helpers
- The review also closed a real coverage gap:
  - `workflow-platform-api` already exposes connector, bridge, policy, secret, scope, and governance-request APIs
  - `control-console` now explicitly owns the minimal operator management surface for those objects, instead of leaving them API-only
- The package also carries the repo-wide projection rule forward:
  - projection adapters may exist
  - the console cannot depend on them as authoritative business truth

## Implementation guardrails for later
- Do not add hidden gateway or frontend fallback paths for operator actions.
- Do not treat manual/debug runs as the main operational story once `agent-first` production entry exists.
- Do not expand the console into a catch-all admin suite before the core operator loop is stable.
- Do not leave connector/bridge/governance management as “temporary raw API work” if those objects are required to operate the platform.
