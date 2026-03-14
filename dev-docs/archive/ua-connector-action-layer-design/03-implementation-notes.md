# 03 Implementation Notes

## Current state
- This subtask is design-only.
- No connector registry, action runtime, or browser automation implementation has been started in this task.

## Initial decisions
- 本子包是 `T-011` 下的后置设计子包，不进入当前主线实施。
- connector 不是 provider/executor 的变体，而是外部能力治理与绑定层。
- action 是 side-effectful capability unit，不等于 workflow node。
- connector-backed actions 与 platform-native actions 不共用同一个 catalog，但共享统一 invoke contract 形状。
- event bridge 只做外部事件归一化，不拥有 workflow 状态机。
- `EventBridge` 首版只冻结 ownership 与 handoff，不冻结 `webhook` / `poll` 实现优先级。
- browser fallback 只作为无稳定 API 时的 fallback，不是主运行时。
- `BrowserFallbackProfile` 只服务于 action execution fallback，不承接 event ingestion。

## Deferred decisions
- 具体 connector catalog schema
- action permission 粒度
- browser fallback 的具体执行环境
- webhook vs poll 的实施选型

## Follow-up TODOs
- 在 `P1/P2/P3` 主线稳定后再启动本子包的细化评审
- 将本子包结果作为未来 connector implementation task 的统一前置
