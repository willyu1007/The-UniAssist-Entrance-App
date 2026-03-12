# 03 Implementation Notes

## Current state
- 本子包是 coverage-completion 设计任务。
- 当前只用于补齐第二验证场景，不进入任何 connector/runtime 实现。

## Initial decisions
- 第二验证场景必须存在，不能只靠教学样本覆盖全部主体需求。
- 场景按 capability 类别抽象，不绑定单一工具品牌。
- Work Graph 首版只作为 overlay 观察项。
- 第二验证场景首版固定为“变更/发布协作”主流程。
- 首版能力组合固定为 `issue_tracker + source_control + ci_pipeline`。
- 首版必须包含至少 1 个受治理外部写操作和 1 个异步 callback 点。

## Deferred decisions
- callback/event summary 的字段级 schema
- 与 control-console 的具体页面映射

## Closure follow-up
- `T-030 / B8` 已直接复用本设计包冻结的主流程、artifact 族和 capability 组合完成实现，证明“变更/发布协作”足以作为第二验证场景的 implementation baseline。
- `ValidationReport`、`DeliverySummary` 与 control-console artifact inspection 的最小映射已在实现包中闭环，因此此前保留的“是否能作为 implementation 前置”问题已收敛。
