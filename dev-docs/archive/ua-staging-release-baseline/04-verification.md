# 04 Verification

## Automated checks
- Executed (2026-02-23, local with temporary Postgres + Redis):
  - `DATABASE_URL=... REDIS_URL=... pnpm release:gate:staging` -> PASS
    - includes:
      - `pnpm typecheck:workspaces` -> PASS
      - `pnpm test:conformance` -> PASS
      - `pnpm smoke:redis:e2e` -> PASS
- Re-check after persistence SQL fix:
  - `DATABASE_URL=... REDIS_URL=... pnpm release:gate:staging` -> PASS

## Manual smoke checks
- Executed (2026-02-23):
  1. 启动 provider/gateway/adapter（本地 staging 端口）
  2. 执行：
     - `STAGING_GATEWAY_BASE_URL=http://localhost:18977 ... pnpm release:verify:staging`
  3. 结果：
     - `/health` 全链路可用（gateway/provider/adapter）
     - ingest accepted（runs=2）
     - timeline 包含 `routing_decision + provider_run + interaction`
     - context API read 鉴权路径成功（token + scope）

## Sample outcome snapshot
- `releaseGate`: `PASS`（~49s）
- `postDeployVerify`: `PASS`
- `timelineKinds`: `inbound,routing_decision,provider_run,interaction`
- `knownNoise`: worker cleanup phase may log `NOGROUP` once

## Rollout / Backout
- Rollout:
  - 先执行 `pnpm release:gate:staging`
  - 再按 runbook 顺序滚动部署
  - 部署后执行 `pnpm release:verify:staging`
- Backout:
  - 详见 `ops/deploy/staging/runbook.md`
  - 真实 staging 的 15 分钟计时演练尚待执行并记录
