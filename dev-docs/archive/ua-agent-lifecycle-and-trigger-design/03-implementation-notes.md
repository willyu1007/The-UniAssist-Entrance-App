# 03 Implementation Notes

## Current state
- 本子包是新增的 coverage-completion 设计任务。
- 当前只用于补齐 v0.2 设计记录中的主体能力覆盖，不进入任何 agent/scheduler 实现。

## Initial decisions
- `workflow` 与 `agent` 必须保持分离。
- `AgentDefinition` 只能包装已发布的 `WorkflowTemplateVersion`。
- `activate/suspend/retire` 不是 `publish` 的别名。
- `WorkflowTemplateVersion -> AgentDefinition` 首版固定为 `1:N`，而不是 `1:1`。
- `manual/message` 可直接触发 template/version；`schedule/webhook/event_subscription` 必须依赖 active agent。
- `AgentDefinition` 状态机首版采用 `draft -> validated -> approved -> active -> suspended -> retired -> archived`。

## Deferred decisions
- `trigger-scheduler` 的最终部署形态
- trigger DTO 与 callback envelope 的字段级 schema
- agent UI 在 control-console 中的具体落点
