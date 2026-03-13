# Pure V1 Platform Rewrite — Roadmap

## Goal
- 建立并交付一个不考虑 `/v0` compatibility 的 pure-`v1` workflow/agent platform。

## Constraints for this round
- 本轮只做 planning 和 governance。
- 不修改产品代码、schema、API、runtime、模块命名或目录结构。
- 所有实施工作都后移到 `T-033` 到 `T-037`。

## Frozen rewrite direction
- no `/v0`
- agent-first run model
- single agent, single runtime strategy in first cut
- phased hard cutover
- legacy `/v0` data is backup-only, then delete

## Task relationship baseline
- `T-032` 是唯一 active planning baseline。
- superseded:
  - `T-011`, `T-012`, `T-013`, `T-018`, `T-005`, `T-007`
- reused as input:
  - `T-014`, `T-015`, `T-019`, `T-020`, `T-021`, `T-031`
- historical evidence only:
  - `T-023`, `T-024`, `T-025`, `T-026`, `T-027`, `T-028`, `T-029`, `T-030`

## Future execution tranches
1. `T-033 / ua-pure-v1-contract-reset`
   - pure-`v1` contracts、event model、OpenAPI、schema planning
2. `T-034 / ua-pure-v1-runtime-cutover`
   - platform API、runtime、worker、agent-first execution path
3. `T-035 / ua-pure-v1-studio-and-agent-ops`
   - control console、draft/studio/debug/operator flows
4. `T-036 / ua-pure-v1-connector-bridge-convergence`
   - dynamic connector loading、connector/runtime/bridge alignment
5. `T-037 / ua-pure-v1-legacy-removal-and-identity-cleanup`
   - legacy backup、module deletion、final naming cleanup

## Execution order and gates
- Required order:
  - `T-033 -> T-034 -> (T-035 + T-036) -> T-037`
- Gate rationale:
  - `T-033` freezes naming, identity, DTOs, events, and schema handoff
  - `T-034` proves the kernel can run without external capability layers
  - `T-035` and `T-036` then extend usability and external capability without reopening the kernel
  - `T-037` runs last because it is destructive and depends on proof from the prior four tasks

## Overall executable coverage
- `T-033 + T-034` cover what pure-`v1` is, how it runs, and how platform-owned triggers enter the system
- `T-035` covers how operators use it and manage the minimum governance / connector / bridge control-plane objects required to operate it
- `T-036` covers how external capabilities attach without polluting the mainline
- `T-037` covers how semantic drift and legacy surfaces are permanently removed

## Exit criteria for this task
- governance mapping is published
- pure-`v1` architecture and task graph are frozen
- implementation tranches are ready
- each follow-on bundle is detailed enough to be executed without reopening umbrella-level decisions
- this task ends before any product code changes begin
