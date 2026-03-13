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

## Out-of-scope reminder
- No controllers, services, routes, runtime loops, or console pages should be implemented here unless they are required only to validate the contract shape.

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
  - mainline types still expose compat fields
  - platform service still synthesizes compat-first template specs
  - runtime service still emits provider-shaped interaction payloads

## Implementation guardrails for later
- `T-034` must not introduce ad hoc contract fields to unblock implementation pressure.
- `T-035` must not create operator DTO variants that bypass the main contract package.
- `T-036` must not project connector or bridge session details back into core run identity.
