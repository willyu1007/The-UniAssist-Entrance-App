# 04 Verification

## Automated checks
- Executed (2026-02-23):
  - `pnpm --filter @baseinterface/worker typecheck` -> PASS
  - `pnpm typecheck:workspaces` -> PASS
  - `DATABASE_URL=postgres://localhost:5432/uniassist_gateway REDIS_URL=redis://127.0.0.1:6379 pnpm smoke:redis:e2e` -> PASS

## Manual smoke checks
- Executed (2026-02-23):
1. 注入 `failed` 记录，验证自动重试并进入 `consumed` -> PASS。
2. 注入 `NOGROUP`（销毁 consumer group）后继续投递，worker 自动重建 group 并恢复消费 -> PASS。
3. 注入 `dead_letter` 记录，执行 replay 命令后恢复为 `failed` 并最终 `consumed` -> PASS。
4. 重复执行同一 `replay_token`，`updated=0`，验证幂等 -> PASS。
5. worker 日志对 transient/NOGROUP 为 `warn` 且限频，未出现高频 error 刷屏 -> PASS。

## Rollout / Backout
- Rollout:
  - 先在 staging 灰度 worker 实例，开启 replay runbook（仅 SRE 可执行）。
  - 观察 `outbox dead_letter`、`retry`、`consumer error` 指标 24h。
- Backout:
  - 回滚到上一个 worker 镜像并暂停 replay 操作入口。
  - 保留 `outbox_replay_log` 仅用于审计，不影响旧 worker 运行。
