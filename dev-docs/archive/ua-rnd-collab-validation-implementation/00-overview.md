# 00 Overview

## Status
- State: archived
- Status note: `B8` 已完成交付、补齐 review follow-up，并在归档前完成文档收口与 project governance sync；研发协作 canonical 场景、`source_control` sample capability、主变更流 + 伴随事件流测试闭环，以及 control-console artifact detail inspection 均已接线并验证。
- Next step: 无；如需继续扩展，仅在后续任务中考虑更真实的 source control vendor adapter 或更丰富的 runboard 呈现。

## Goal
实现 `T-011 / B8` 的研发协作验证实施包：以通用变更/发布协作场景验证平台在 connector 写操作治理、异步 callback、event subscription 与现有 control-console 可观测性上的最小可运行闭环。

## Non-goals
- 不新增 northbound API
- 不修改 Prisma schema
- 不实现真实厂商 connector
- 不为研发协作新增专用控制台页面
- 不把 `source_control` 扩成 repo 写入型 capability

## Context
- `T-022` 已冻结第二验证场景的主流程、artifact 族与最低压测要求，但当前 repo 仍缺 `source_control` 第三类 capability，也缺研发场景的 canonical docs 与 runtime/test 闭环。
- `B7` 已交付 `issue_tracker + ci_pipeline`、connector governance、same-run callback 续跑与 `event_subscription` 基础能力。
- `B8` 必须复用现有平台对象和控制台接口，不把验证场景实施反向做成新的基础设施 tranche。

## Acceptance criteria (high level)
- [x] 建立独立 `B8` task bundle 并同步 project governance
- [x] 新增 `docs/scenarios/rnd-collab` canonical docs / fixtures / expected outputs
- [x] `packages/workflow-contracts` 补齐研发协作 typed payload 与 scenario helper
- [x] 新增 `source_control` sample connector，并与主变更流测试接线
- [x] runtime / platform tests 同时覆盖 same-run callback 与 event subscription companion flow
- [x] control-console 在现有 runs/approvals 视图中可检查研发协作 artifacts
