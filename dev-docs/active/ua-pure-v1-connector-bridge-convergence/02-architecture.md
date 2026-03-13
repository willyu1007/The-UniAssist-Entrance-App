# 02 Architecture

## Scope boundary
- This task owns:
  - `connector-runtime`
  - connector action/event integration path
  - external runtime bridge integration path
  - runtime alignment to the pure-`v1` ledger
- This task does not own:
  - pure-`v1` contract naming
  - operator IA
  - final legacy deletion

## External capability principles
- External capabilities extend the platform; they do not redefine platform identities.
- Connector integration and external bridge integration are different extension modes but share one ledger.
- Governance remains platform-owned even when execution is delegated.

## Convergence rules
- connector runtime MUST load enabled connectors dynamically
- bridge runtime MUST report state through the same run/approval/artifact ownership model
- both paths MUST respect:
  - `PolicyBinding`
  - `ScopeGrant`
  - `SecretRef`
  - single-agent single-strategy rule from `T-032`

## Execution model
- `platform_runtime`
  - may invoke connector-backed actions via bound action snapshots
- `external_runtime`
  - may advance through bridge callbacks and approval handshakes
- neither path may redefine run identity, approval identity or artifact ownership

## Ledger convergence model
- Connector paths write extension records that attach to canonical runs:
  - connector action sessions
  - connector event receipts
- Bridge paths write extension records that attach to canonical runs:
  - bridge invoke sessions
  - bridge callback receipts
- Those records are implementation details for external execution tracing.
- Canonical operator and runtime queries must still flow through:
  - `WorkflowRun`
  - `WorkflowNodeRun`
  - `ApprovalRequest`
  - `InteractionRequest`
  - `Artifact`

## Dynamic loading model
- Runtime connector availability must be driven by one of:
  - control-plane enabled connector set
  - deployment manifest
  - both, with deterministic conflict rules
- Hardcoded sample connector maps are allowed only as temporary development scaffolds and are not an acceptable completion state for this task.

## Current repo evidence to account for
- `apps/connector-runtime/src/server.ts` currently hardcodes sample adapters in an in-memory map.
- `apps/workflow-platform-api/src/server.ts` already exposes connector definition/binding, action binding, event subscription, and bridge registration APIs.
- `apps/workflow-runtime/src/store.ts` and `runtime-repository.ts` already contain bridge and connector session/receipt records that should be converged rather than replaced.
- `packages/workflow-contracts/src/connector-runtime.ts` and `external-runtime-bridge.ts` already provide typed building blocks that must now align with the pure-`v1` ledger.

## Governance and security carry-over
- `PolicyBinding`, `ScopeGrant`, and `SecretRef` checks remain platform-owned and must not move into connector-specific or bridge-specific private policy models.
- Internal auth remains required for:
  - connector invoke
  - connector callback
  - bridge callback
  - runtime lookup endpoints

## Boundary exclusions
- This task does not rework the main operator IA.
- This task does not create vendor-specific dashboards unless required by `T-035` route groups.
- This task does not keep sample adapters as a permanent product capability.

## Verification target
- An implementer can plug in external capabilities without reopening any pure-`v1` core ledger decision.
