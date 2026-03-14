# 03 Implementation Notes

## Initial note
- `T-036` converges external capabilities onto a kernel that must already exist.
- It is not the place to finish unfinished core runtime work.

## Responsibility contract
- connector and bridge paths may extend the kernel
- connector and bridge paths may not redefine the kernel

## Expected repo landing
- `apps/connector-runtime`
- `apps/connectors/*`
- `apps/executor-bridge-*`
- `apps/workflow-runtime`
- `apps/workflow-platform-api`

## Review closure
- This package now treats external capability work as reconciliation work, not fresh platform design.
- The review confirmed there is already enough structure in the repo to justify convergence instead of reinvention:
  - platform APIs already exist for connector and bridge control-plane objects
  - runtime persistence already has bridge and connector extension records
  - connector runtime still hardcodes sample adapters and needs ownership correction
- The package also fixes one sequencing rule:
  - if an external path requires new run identities or private approval/artifact semantics, the design is wrong

## Implementation guardrails for later
- Do not introduce provider-style naming to describe connector or bridge sessions.
- Do not let bridge callbacks bypass the canonical run ledger and update queries directly.
- Do not keep dynamic loading as future work once this package claims completion.

## T-036 landing summary
- Added `UNIASSIST_CONNECTOR_REGISTRY_JSON` to the repo env contract and implemented shared parsing in `packages/connector-sdk`, including enabled-key filtering and deterministic registry normalization.
- Replaced the hardcoded sample adapter map in `apps/connector-runtime` with registry-driven dynamic loading. Runtime startup now logs the loaded connector set and synchronous connector completions now return pure-`v1` `result` payloads instead of compat completion metadata.
- Updated `apps/workflow-platform-api` to intersect deployment-enabled connector keys with active control-plane bindings before:
  - resolving connector action snapshots for `platform_runtime` runs
  - serving event-subscription runtime config
  - dispatching event-subscription deliveries into the runtime ledger
- Converged connector and bridge result handling in `apps/workflow-runtime` onto a shared pure-`v1` external-result path:
  - connector sync/async completion
  - bridge `result` callbacks
  - actor/audience/delivery side-record upserts
  - canonical artifact creation
- Removed new-write dependence on `run.metadata.connectorRuntime` as the connector-path source of truth. The runtime now strips that field before persistence and only projects connector runtime state back into snapshots for query/read visibility.
- Made connector tables authoritative for new writes by persisting connector action sessions and connector event receipts through the runtime repository, including the new `connector_event_receipts.run_id` linkage.
- Added the internal runtime receipt command for event-subscription handoff. `workflow-platform-api` remains trigger owner, but once dispatch resolves the canonical `runId`, it records the event receipt into runtime so external ingress lands in the shared ledger.
- Standardized receipt-event ownership across:
  - connector action callbacks
  - event-subscription ingress receipts
  - bridge callbacks
  using the same runtime-owned `external.callback.received` event family with source-specific metadata.
- Closed the post-implementation review gaps without reopening package scope:
  - connector adapters can now supply a real `receiptKey`, and runtime uses it as the authoritative callback dedupe key instead of silently collapsing back to `callbackId`
  - rejected bridge and connector callbacks now emit the same runtime-owned receipt formal event family as accepted callbacks, so the receipt ledger and the event stream stay aligned
  - event-subscription receipt handoff now validates the run source linkage against `sourceType`, `sourceRef`, and runtime trigger metadata before writing authoritative receipt rows

## Repo files touched
- `packages/connector-sdk`
- `packages/workflow-contracts`
- `apps/connector-runtime`
- `apps/workflow-runtime`
- `apps/workflow-platform-api`
- `prisma/schema.prisma`
- `prisma/migrations/20260314044700_connector_event_receipts_run_id/migration.sql`
