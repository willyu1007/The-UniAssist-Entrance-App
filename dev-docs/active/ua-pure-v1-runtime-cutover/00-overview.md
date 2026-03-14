# 00 Overview

## Status
- State: done
- Status note: `T-034` 已完成 pure-`v1` backend kernel cutover：`workflow-runtime` 现在可在不依赖 `/v0` compat provider 的前提下执行 platform-native workflow，`worker -> gateway` 已降级为可选 projection sidecar，`platform-api`/`trigger-scheduler` 复用现有 trigger control-plane 跑通 native proof。
- Next step: `T-035` 直接消费已稳定的 run/approval/interaction/artifact/query/cancel semantics；`T-036` 仅负责把 connector / bridge 能力接回 pure-`v1` kernel，而不是补主线可运行性。

## Goal
交付一个不依赖 `/v0`、gateway、provider projection、connector runtime 或 external runtime bridge 的最小 pure-`v1` backend kernel，并包含 production entry 所需的平台自有 trigger runtime infrastructure。

## Non-goals
- 不实现 control-console 页面
- 不实现 connector 动态加载和 bridge convergence
- 不执行 legacy 模块删除
- 不在本任务中解决最终命名清扫

## Context
- `T-032` 要求 pure-`v1` backend kernel 必须先独立成立，否则 `T-036` 会承接过多主线责任。
- 当前后端主线仍混有 `compatProviderId`、provider-shaped resume 和 `/v0` 投影路径。
- `T-034` 的交付必须证明平台在没有外部能力层的情况下也能跑通最小流程。
- 当前仓库还没有一个稳定、可重复触发 `interaction requested -> response -> continue` 的最小测试夹具；这一缺口会让交互恢复链路无法形成可信验收。

## Acceptance criteria (high level)
- [x] `workflow-platform-api`、`workflow-runtime`、`worker`、`trigger-scheduler` 已按 pure-`v1` contract 接线
- [x] 生产运行入口固定为 `agent-first`，无论来自显式 API 还是平台拥有的 trigger dispatch
- [x] 平台可在不依赖 connector/bridge 的前提下跑通最小 run lifecycle
- [x] schedule/webhook trigger 能经由 pure-`v1` path 启动 agent run，而不是回落到 legacy ingress
- [x] `approval` 与 `interaction` 阻塞/恢复使用 pure-`v1` request identity，而不是 compat 投影字段
- [x] formal events、artifacts、approvals 和 run queries 已形成 pure-`v1` 主线闭环
- [x] `T-034` 保留最小 compat fixture 作为 `interactionRequestId` 恢复链路回归证明，同时新增独立 native fixture 作为 pure-`v1` kernel 主证明
