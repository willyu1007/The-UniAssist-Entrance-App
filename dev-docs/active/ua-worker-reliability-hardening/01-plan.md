# 01 Plan

## Phases
1. 状态机审计与规范化
2. replay 工具实现
3. 降噪与错误分级处理
4. 故障注入与验收

## Detailed steps
- 梳理 outbox 生命周期与状态迁移约束。
- 增加 dead-letter 查询与重放命令。
- 区分可忽略错误、可重试错误、致命错误。
- 注入 Redis 不可用/DB 抖动，验证恢复过程。
- 补充文档：故障处理 SOP。

## Risks & mitigations
- Risk: replay 导致重复消费。
- Mitigation: 基于 event_id 幂等校验。
- Risk: 降噪误吞关键错误。
- Mitigation: 错误白名单最小化，并保留采样日志。
