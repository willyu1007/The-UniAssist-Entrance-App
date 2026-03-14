# 01 Plan

## Phases
1. 指标与告警需求定义
2. 埋点与日志改造
3. 告警接入与阈值校准
4. 演练与文档沉淀

## Detailed steps
- 定义关键路径 SLI：请求成功率、P95 延迟、投递成功率、重试率。
- 统一日志字段：traceId/sessionId/runId/providerId。
- 暴露或汇聚 metrics，完成 dashboard 首版。
- 设置告警策略并避免噪音（抑制与去重）。
- 完成一次“异常注入 -> 告警触发 -> 排障恢复”演练。

## Risks & mitigations
- Risk: 指标过多导致维护成本高。
- Mitigation: 先保留少量核心指标，分阶段扩展。
- Risk: 告警噪音过大。
- Mitigation: 用分级阈值和抑制窗口控制。
