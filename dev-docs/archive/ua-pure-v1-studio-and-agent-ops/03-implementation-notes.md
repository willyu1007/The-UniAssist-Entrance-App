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

## Implementation landing in this round
- `packages/workflow-contracts` now publishes shared `/v1/workflows` list/detail DTOs so both `workflow-platform-api` and `control-console` consume the same template response contract.
- `apps/workflow-platform-api/src/platform-repository.ts` now aliases workflow detail to the shared DTO instead of maintaining a controller-local shape.
- `apps/control-console/src/api.ts` and `query.tsx` now cover:
  - templates and debug/manual version start
  - agents, trigger bindings, action bindings, and production agent-first run start
  - connector definitions, connector bindings, event subscriptions, and bridge registrations
  - policy bindings, secret refs, scope grants, and governance change requests
  - run, approval, artifact, and draft queries/mutations already needed by studio and investigation flows
- `apps/control-console/src/router.tsx` and `components.tsx` now implement the 6-domain IA:
  - `Templates`
  - `Studio`
  - `Agents`
  - `Capabilities`
  - `Governance`
  - `Runs`
- new route workspaces landed for:
  - template browse/detail/debug launch
  - agent create/detail/lifecycle/trigger/action/run controls
  - capability management
  - governance management
  - artifact deep-link inspection
- `Workflow Studio` copy and outcomes were rewritten so helper intake/synthesize remain secondary authoring tools, while publish output now routes operators toward templates and agent promotion instead of builder/chat narratives.
- `Runs` now treats approvals and artifacts as investigation surfaces, with artifact deep links retained as secondary routes.
- `apps/gateway` received a minimal compatibility alignment so workspace typecheck can succeed against the current contracts:
  - workflow event translation now uses gateway-known provider identity instead of removed run fields
  - builder intake requests now use `authoring_intake`
- No authoritative API renames were introduced in this task.
- No new SSE event kinds were introduced in this task; console consistency for the new surfaces relies on mutation success + query invalidation.

## Implementation guardrails for later
- Do not add hidden gateway or frontend fallback paths for operator actions.
- Do not treat manual/debug runs as the main operational story once `agent-first` production entry exists.
- Do not expand the console into a catch-all admin suite before the core operator loop is stable.
- Do not leave connector/bridge/governance management as “temporary raw API work” if those objects are required to operate the platform.
