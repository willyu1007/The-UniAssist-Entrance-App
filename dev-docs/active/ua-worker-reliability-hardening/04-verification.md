# 04 Verification

## Automated checks (planned)
- worker 单测：状态迁移与重试策略
- 集成测：故障注入后最终一致性

## Manual smoke checks (planned)
1. 人工注入 failed 记录，验证重试恢复
2. 人工制造 dead_letter，验证 replay 成功
3. 清理场景下确认无高频噪音日志

## Rollout / Backout (planned)
- Rollout: 新逻辑先灰度到 staging worker。
- Backout: 保留旧 worker 镜像与配置，一键回切。
