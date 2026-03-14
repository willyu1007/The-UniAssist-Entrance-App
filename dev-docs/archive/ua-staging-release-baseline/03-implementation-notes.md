# 03 Implementation Notes

## Status
- Current status: `in-progress`
- Last updated: 2026-02-23

## What changed
- 新增部署目录与文档：
  - `ops/deploy/README.md`
  - `ops/deploy/AGENTS.md`
  - `ops/deploy/staging/env.example`
  - `ops/deploy/staging/runbook.md`
- 新增可执行脚本：
  - `ops/deploy/scripts/staging-release-gate.mjs`
  - `ops/deploy/scripts/staging-post-deploy-check.mjs`
- 根脚本新增：
  - `pnpm release:gate:staging`
  - `pnpm release:verify:staging`
- README 新增 staging 发布门禁与发布后验证入口。
- 修复门禁实测中发现的 Postgres 参数类型推断错误：
  - `apps/gateway/src/persistence.ts`
  - `saveUserContext` 中 `to_timestamp(($4 + $5) / 1000.0)` -> `to_timestamp(($4::bigint + $5::bigint) / 1000.0)`

## Decisions & tradeoffs
- Decision:
  - 将发布门禁做成仓库脚本（而非仅 runbook 文本命令）。
  - Rationale:
    - 保证门禁步骤可重复执行且易接入 CI/CD。
  - Tradeoff:
    - 本地执行门禁需要可用的 Postgres/Redis 依赖。

- Decision:
  - 发布后验证脚本默认仅强制 gateway，provider/adapter 作为可选项检查。
  - Rationale:
    - 兼容不同环境中的增量部署节奏。
  - Tradeoff:
    - 若不传 provider/adapter 地址，相关检查会被跳过。

## Known issues / follow-ups
- TODO: 在真实 staging 环境完成一次“故障触发 -> 15 分钟内回滚”计时演练并记录证据。
- TODO: 当前 smoke 清理阶段仍可能出现 worker `NOGROUP` 日志噪音（不影响门禁结果）。

## Pitfalls / dead ends (do not repeat)
- Keep the detailed log in `05-pitfalls.md` (append-only).
