# 02 Architecture

## Scope boundary
- This task owns:
  - `apps/control-console`
  - operator-facing query/mutation surfaces required for console workflows
  - operator-facing query/mutation surfaces required for connector/bridge/governance management
  - studio/debug flows on top of pure-`v1` objects
- This task does not own:
  - run ledger semantics
  - connector runtime loading
  - bridge callback semantics
  - legacy cleanup

## Operator surface principles
- The console is an operator and authoring surface, not a user-facing runtime product surface.
- Every route group must map to a canonical pure-`v1` object family.
- Every operator action must call one authoritative API owner.
- Projection layers may accelerate reads but must never redefine business truth.

## Primary route groups
- Top-level operator domains:
  - `/templates`
  - `/studio`
  - `/agents`
  - `/capabilities`
  - `/governance`
  - `/runs`
- Deep-link and investigation routes retained under the domains:
  - `/drafts`
  - `/approvals`
  - `/artifacts`
  - `/governance/requests/$requestId`

## Required capabilities
- browse and inspect templates and versions
- create/edit/validate/publish drafts
- create/configure agents and triggers
- inspect and manage connector definitions, connector bindings, action bindings, and event subscriptions as needed for operator workflows
- inspect and manage bridge registrations needed by `external_runtime` agents
- inspect and manage policy bindings, secret refs, scope grants, and governance change requests needed to enable safe execution
- inspect runs, blockers and artifacts
- inspect and decide approvals
- launch manual/debug runs via operator-only flow

## Operator action model
- `Draft authoring` is about structured authoring and publication, not chat intake.
- `Agent operations` are about activation state, trigger bindings, and runtime strategy visibility.
- `Capability operations` are about connector bindings, action/event wiring, and bridge registrations required to make agents runnable.
- `Governance operations` are about policy bindings, secret refs, scope grants, and governance requests required to enable or approve risky changes.
- `Run operations` are about status, blockers, artifacts, cancellation, and investigation.
- `Approval operations` are about review and decision on canonical approval requests.
- `Studio/debug` exists for authoring validation and investigation. It is not a substitute for production entry.

## Query boundary
- control-console MUST use `workflow-platform-api` only
- no direct DB, runtime, Convex or Redis access
- no hidden fallback to chat/gateway endpoints

## API and projection boundary
- `workflow-platform-api` remains the only authoritative backend for console reads and writes.
- Runboard or similar projections may exist as optional adapters for responsiveness.
- If a projection fails, the console must fall back to authoritative API queries without losing correctness.
- Convex remains a projection experiment and must not become an operator-facing source of truth by UI drift.

## Current repo evidence to account for
- `apps/control-console/src/api.ts` and `query.tsx` now expose typed operator clients and mutations for templates, agents, capabilities, governance, runs, approvals, artifacts, and studio flows.
- `apps/workflow-platform-api/src/server.ts` remains the authoritative API owner for all console reads and writes.
- draft-intake and synthesize endpoints remain available, but the console now frames them only as authoring helpers rather than primary builder/chat ingress.
- `apps/control-console/src/` now contains matching route coverage for templates, agents, capability objects, governance objects, run investigation, and studio publication flows.
- `apps/workflow-platform-api/src/runboard-projection.ts` already contains authoritative fallback behavior, which should remain explicit rather than implicit.

## Non-goal boundary clarifications
- This task does not build:
  - a full enterprise policy administration suite
  - connector vendor dashboards beyond what is required to bind and operate agents
  - bridge debugging consoles beyond what is necessary for run investigation
  - chat-style end-user interaction surfaces

## Handoff contract to T-037
- after `T-035` lands, no operator-critical workflow should still require legacy modules or names to function

## Verification target
- An operator can drive the pure-`v1` system end-to-end through control-console and API surfaces alone.
