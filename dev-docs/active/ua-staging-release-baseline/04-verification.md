# 04 Verification

## Automated checks (planned)
- `pnpm typecheck:workspaces`
- `pnpm test:conformance`
- `pnpm smoke:redis:e2e`

## Manual smoke checks (planned)
1. 发布后 `/health` 全链路可用
2. ingest -> route -> provider -> timeline 可见
3. worker 消费与 outbox 状态收敛
4. 故障回滚后服务恢复

## Rollout / Backout (planned)
- Rollout: 分批发布至 staging，门禁通过后放量。
- Backout: 保留上个稳定版本，异常触发立即回滚。
