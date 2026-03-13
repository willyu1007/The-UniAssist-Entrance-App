# 03 Implementation Notes

## Initial note
- `T-034` is the first task that turns pure-`v1` planning into a runnable backend.
- The kernel delivered here is intentionally minimal but must be real, not a contract-only scaffold.

## Responsibility contract
- `T-034` proves the platform can run as pure-`v1`.
- `T-036` extends external capability integration; it does not rescue a non-runnable kernel.

## Expected repo landing
- `apps/workflow-platform-api`
- `apps/workflow-runtime`
- `apps/worker`
- `packages/workflow-contracts`
- persistence/repository layers tied to those services

## Review closure
- This package now treats kernel viability as the primary acceptance bar.
- The review confirmed that several current code paths cannot remain in the kernel definition:
  - gateway projection ownership inside `worker`
  - compat/provider payload generation inside `workflow-runtime`
  - compat-shaped request parsing inside `workflow-platform-api`
  - trigger infrastructure existing as partially separate plumbing without explicit kernel ownership
- The package also now fixes one key sequencing rule:
  - `T-036` is not allowed to become the first place where a run can truly complete
  - if connector or bridge integration is required to prove execution, `T-034` is incomplete
  - if schedule/webhook triggers cannot start a pure-`v1` run, production entry is incomplete

## Implementation guardrails for later
- Do not accept a backend cutover that only renames DTOs while keeping gateway in the mainline path.
- Do not treat debug-only direct version runs as a substitute for production `agent-first` entry.
- Do not move runtime state ownership into worker jobs just to ease async implementation.
- Do not leave `trigger-scheduler` outside the task boundary just because the platform API already exposes trigger endpoints.
