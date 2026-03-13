# 00 Overview

## Status
- State: planned
- Status note: `T-035` 已建立为 pure-`v1` operator/studio surface task；当前仅完成任务包建档。
- Next step: 在 `T-034` 提供稳定 backend kernel 后，接手 control-console 和 operator-facing API/query/mutation surface。

## Goal
交付 pure-`v1` 的 studio 与 operator surface，使运维者和设计者可以不依赖聊天入口完成模板、agent、trigger、run、approval、artifact，以及支撑运行所需的 connector/bridge/governance 对象的主线操作。

## Non-goals
- 不重定义 backend kernel contract
- 不实现 connector/bridge 运行机制
- 不做 legacy 模块删除
- 不把控制台扩展成全量后台系统或通用企业管理台

## Context
- `T-015` 已冻结 control-console 的主页面和 query 边界。
- pure-`v1` 方向已经删除 builder chat intake 和 gateway ingress 的主线意义。
- 因此 `T-035` 的控制台必须围绕正式对象和 operator action 展开，而不是聊天兼容入口。

## Acceptance criteria (high level)
- [ ] 控制台可围绕 drafts/templates/agents/triggers/runs/approvals/artifacts 完成主线操作
- [ ] 控制台提供最小可运营的 connector/bridge/policy/secret/scope/change-request 管理面
- [ ] `Workflow Studio` 只承担 pure-`v1` draft/spec/operator flows，不再绑定 chat intake
- [ ] 所有页面仅依赖 `workflow-platform-api` 暴露的 pure-`v1` query/mutation surface
- [ ] manual/debug run 能以 studio/operator capability 方式存在，但不重新成为主业务入口
- [ ] 页面信息架构和 view model 能覆盖 `T-034` 与 `T-036` 的主线对象
