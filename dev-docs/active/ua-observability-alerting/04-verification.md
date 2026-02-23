# 04 Verification

## Automated checks (planned)
- 指标端点/采集连通性检查
- 告警规则语法与加载检查

## Manual smoke checks (planned)
1. 人工触发 ingest 错误，观察告警触发
2. 人工制造 outbox backlog，观察告警触发
3. 告警触发后按 runbook 完成恢复

## Rollout / Backout (planned)
- Rollout: 先开 dashboard 再开告警，最后提升阈值敏感度。
- Backout: 告警先降级为观察模式，不影响主链路。
