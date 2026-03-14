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

## Additional implementation note
- `T-034` now also owns a temporary verification harness requirement:
  - add the smallest compat fixture that can deterministically drive `interaction requested -> response -> continue`
  - keep it isolated from authoritative contracts and production kernel ownership
  - remove or retire it later when native fixtures fully cover the same proof scenario
- This note exists because the current repo does not yet provide a stable, repeatable fixture for the interaction recovery chain, and that gap would otherwise make kernel acceptance unverifiable.

## Implementation guardrails for later
- Do not accept a backend cutover that only renames DTOs while keeping gateway in the mainline path.
- Do not treat debug-only direct version runs as a substitute for production `agent-first` entry.
- Do not move runtime state ownership into worker jobs just to ease async implementation.
- Do not leave `trigger-scheduler` outside the task boundary just because the platform API already exposes trigger endpoints.
- Do not let the temporary compat fixture leak provider/task semantics back into `packages/workflow-contracts` or the mainline API surface.

## Landed in this task
- `apps/workflow-runtime` now treats `platform.emit_artifact`, `platform.request_interaction`, and `platform.fail` as reserved native executors inside the existing `executorId` string contract; no public DTO or schema field was added.
- Runtime executor routing is now ordered as: connector executor -> external runtime bridge -> platform-native executor -> compat executor fallback. This makes `platform_runtime` the real pure-`v1` mainline while keeping compat harnesses isolated for regression coverage.
- `cancelRun()` no longer assumes an external runtime bridge exists. Platform-native runs now cancel authoritatively from `waiting_approval` and `waiting_interaction`, including current node state, run state, pending approvals, pending interactions, and live connector sessions.
- `apps/worker` no longer treats gateway projection as a correctness dependency. `workflow_formal_event` forwarding is skipped when no gateway base URL is configured, and gateway failures are logged as sidecar degradation instead of poisoning the authoritative kernel path.
- `apps/workflow-runtime/tests/native-platform-runtime.test.ts` is the new pure-`v1` proof fixture for native artifact -> approval -> interaction -> completion / failure / cancel flows. The older compat fixture remains in place only to keep `interactionRequestId` recovery regressions observable.
- `apps/workflow-platform-api/tests/native-platform-runtime.test.mjs` proves that published native workflows can be attached to an active agent and started through both webhook and schedule trigger dispatch, with duplicate dispatch dedupe preserved and public run/approval/artifact queries remaining intact.
