# 03 Implementation Notes

## Current state
- This subtask is design-only.
- No product code, schema, or runtime implementation has been started in this task.

## Initial decisions
- 本子包任务 ID 为 `T-012`，隶属于 `T-011 / ua-openclaw-collab-platform`。
- `workflow-platform-api` 是统一命令入口和统一查询入口。
- `ingress-gateway` 只通过 `workflow-platform-api` 进入 workflow 路径。
- timeline/chat 投影最终归 `ingress-gateway`。
- continuation 采用 `runtime + worker` 协作。
- `outbox + Redis stream + worker` 视为长期可演进基础设施，而不是短期桥接。
- `P1` 最小对象集固定为 `workflow/run/node/artifact/approval`，排除 `AgentDefinition`、trigger/scheduler、connector/action。

## Deferred decisions
- internal command path 的最终命名细节
- formal event envelope 的字段细化
- 数据表字段级 schema 设计（交给 `data-plane` 子包）
- query DTO 和 console view model 细化（交给 `control-console` 子包）

## Follow-up TODOs
- 评审 `T-018 / ua-workflow-data-plane-design`
- 评审 `T-013 / ua-builder-draft-sot-design`
- 在母任务 `T-011` 中记录首个设计子包已创建
