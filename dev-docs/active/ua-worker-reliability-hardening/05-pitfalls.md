# 05 Pitfalls

## Do-not-repeat summary
- smoke 脚本若对 Redis 使用默认重连策略，在 Redis 不可达时可能长时间挂起。

## Resolved issues log
- 2026-02-23: `redis-e2e-smoke` 在 Redis down 场景出现长时间重连，导致验证阻塞。
  - Fix: 将 smoke Redis client 改为 `reconnectStrategy: () => false` + `connectTimeout=3000`，快速失败并释放流程。
