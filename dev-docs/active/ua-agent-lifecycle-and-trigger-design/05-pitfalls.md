# 05 Pitfalls (do not repeat)

This file exists to prevent repeating mistakes within this task.

## Do-not-repeat summary (keep current)
- 不要把每个 workflow 自动升格为 agent。
- 不要把 trigger config 和调度治理直接塞进 runtime state machine。
- 不要把 `activate` 和 `publish` 合并成一个动作。
- 不要把 `WorkflowTemplateVersion` 和 `AgentDefinition` 锁成 `1:1`。
- 不要要求 `manual/message` 触发也必须先创建长期 agent。
