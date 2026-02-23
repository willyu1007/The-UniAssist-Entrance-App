# Roadmap

## Summary
强化 worker 的异常恢复能力与可操作性，覆盖重试策略、dead-letter 处置、清理期日志降噪与故障注入测试。

## Milestones
1. 状态机收口：确保 `pending/processing/failed/delivered/consumed/dead_letter` 行为一致。
2. 恢复工具：提供 dead-letter 重放与单条修复能力。
3. 降噪与鲁棒性：处理清理期 `NOGROUP` 等已知噪音。
4. 失败演练：Redis/DB 抖动场景验证恢复。

## Deliverables
- worker 状态机规范
- dead-letter replay 工具
- 故障注入测试报告
