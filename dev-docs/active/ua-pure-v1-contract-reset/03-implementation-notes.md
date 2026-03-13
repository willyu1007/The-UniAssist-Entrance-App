# 03 Implementation Notes

## Initial note
- `T-033` is the first execution-facing task under `T-032`.
- Its purpose is to remove semantic ambiguity before any backend or UI rewrite begins.

## Responsibility contract
- `T-033` decides what pure-`v1` means at the contract level.
- `T-034` and later tasks consume this contract; they do not reopen core naming or DTO meaning.

## Expected repo landing
- `packages/workflow-contracts`
- `docs/context/api/openapi.yaml`
- `prisma/schema.prisma`
- `docs/context/db/schema.json`
- `apps/workflow-platform-api`
- `apps/workflow-runtime`
- `apps/control-console`
- `packages/convex-projection-experiment`

## Implemented baseline
- `packages/workflow-contracts` was reset to pure-`v1` authoritative DTOs, formal events, and run/interaction request shapes.
- gateway-only compat bridge types were moved out of `@baseinterface/workflow-contracts` into `apps/gateway/src/gateway-types.ts`.
- `prisma/schema.prisma` removed authoritative compat columns from workflow template/run/node-run tables and added `interaction_requests`.
- `docs/context/api/openapi.yaml` now freezes the pure-`v1` route families and explicitly demotes governance-change endpoints to auxiliary proposal storage.
- direct consumers were tightened enough to compile against the new contract surface without re-exporting compat fields.

## Removal ledger
- Removed from mainline contract/package exports:
  - `WorkflowStartRequest`
  - `WorkflowResumeRequest`
  - `WorkflowEventProjectionRequest`
  - `WorkflowEntryRegistryEntry`
  - provider-shaped `WorkflowFormalEvent`
- Removed from authoritative persistence:
  - `workflow_templates.compat_provider_id`
  - `workflow_runs.compat_provider_id`
  - `workflow_node_runs.task_id`
  - `workflow_node_runs.reply_token`
  - `workflow_node_runs.compat_task_state`
- Added authoritative replacements:
  - `WorkflowVersionRunStartRequest`
  - `WorkflowInteractionRequestRecord`
  - `WorkflowInteractionResponseRequest`
  - `WorkflowInteractionResponseResponse`
  - `interaction_requests`
- Quarantined compat-only ownership:
  - gateway projection/request bridge types now live under `apps/gateway`
  - runtime still contains local compat executor/bridge adapter logic pending pure-`v1` behavior cutover in `T-034` / `T-036`

## Review closure
- This task now treats the contract layer as four coupled outputs that must freeze together:
  - TypeScript contract types
  - OpenAPI surface
  - persistence planning
  - removal ledger
- The bundle is intentionally stricter than earlier design docs:
  - `T-019` and `T-021` remain design inputs
  - neither is allowed to override naming or identity semantics once `T-033` freezes them
- The review also confirmed concrete repo hotspots that justify this task:
  - mainline types had exposed compat fields
  - platform service had synthesized compat-first template specs
  - runtime service had emitted provider-shaped interaction payloads

## Post-review fixes
- Follow-up quality fixes landed after the first `T-033` cut to close concrete regressions in the new interaction path:
  - `workflow-platform-api` now resolves `interactionRequestId` through an authoritative runtime lookup instead of scanning recent runs
  - `workflow-runtime` now treats `task_state.ready + require_user_confirm` as a real pending interaction request, so continuation stays on pure-`v1` request identity
  - compat interaction resume now maps to explicit legacy actions (`answer_task_question` vs `execute_task`) instead of the unusable placeholder `submit_interaction_response`
  - interaction response state is only committed after compat executor calls succeed, and `resumeRun` now rolls back in-memory state on failure
- A minimal compat fixture was also added under `apps/provider-sample` for deterministic `interaction requested -> response -> continue` verification.
- These fixes improve correctness and testability, but they do not erase the remaining compat adapter debt inside `workflow-runtime`; that debt still belongs to `T-034` / `T-036` / `T-037`.

## Implementation guardrails for later
- `T-034` must not introduce ad hoc contract fields to unblock implementation pressure.
- `T-035` must not create operator DTO variants that bypass the main contract package.
- `T-036` must not project connector or bridge session details back into core run identity.
