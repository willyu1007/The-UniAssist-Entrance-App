# 00 Overview

## Status
- State: planned
- Status note: `T-034` 已建立为 pure-`v1` backend kernel cutover task；当前仅完成任务包建档。
- Next step: 在 `T-033` 冻结 contract baseline 后，接手 `workflow-platform-api`、`workflow-runtime`、`worker` 和 `trigger-scheduler` 的主线切换。

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

## Acceptance criteria (high level)
- [ ] `workflow-platform-api`、`workflow-runtime`、`worker`、`trigger-scheduler` 已按 pure-`v1` contract 接线
- [ ] 生产运行入口固定为 `agent-first`，无论来自显式 API 还是平台拥有的 trigger dispatch
- [ ] 平台可在不依赖 connector/bridge 的前提下跑通最小 run lifecycle
- [ ] schedule/webhook trigger 能经由 pure-`v1` path 启动 agent run，而不是回落到 legacy ingress
- [ ] `approval` 与 `interaction` 阻塞/恢复使用 pure-`v1` request identity，而不是 compat 投影字段
- [ ] formal events、artifacts、approvals 和 run queries 已形成 pure-`v1` 主线闭环
