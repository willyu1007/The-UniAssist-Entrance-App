# 03 Implementation Notes

## Status
- Current status: `in-progress`
- Last updated: 2026-02-23

## What changed
- worker consumer 异常分级与降噪：
  - `apps/worker/src/worker.ts`
  - 新增 `NOGROUP` 自动恢复（重建 consumer group）
  - 新增 transient 错误限频日志（30s）
- dead-letter replay 工具：
  - `apps/worker/scripts/dead-letter-replay.mjs`
  - `apps/worker/package.json` 新增 `replay:dead-letter`
  - 根 `package.json` 新增 `worker:replay:dead-letter`
  - 通过 `replay_token` + `outbox_replay_log` 实现幂等重放
- Redis e2e 冒烟扩展：
  - `apps/worker/scripts/redis-e2e-smoke.mjs`
  - 新增 NOGROUP 注入恢复校验
  - 新增 dead_letter -> replay -> consumed 校验
  - 新增 replay 幂等二次执行校验
- staging 演练脚本与运维文档：
  - `ops/deploy/scripts/staging-worker-reliability-drill.mjs`
  - `ops/deploy/staging/runbook.md`
  - `ops/deploy/staging/env.example`
  - 根 `package.json` 新增 `pnpm worker:drill:staging`

## Decisions & tradeoffs
- Decision:
  - replay 幂等以 `replay_token` 为主键约束维度（`UNIQUE(replay_token, event_id)`）。
  - Rationale:
    - 满足“同一操作可重放不重复生效”，同时保留运维再次重放的能力。
  - Tradeoff:
    - 不同 token 仍可对同一 event 再次重放，需要 runbook 约束操作频率。

- Decision:
  - `NOGROUP` 采用“自动恢复 + 限频 warn”，而非持续 error。
  - Rationale:
    - 清理竞态属于可恢复异常，应降低噪音并维持可观测性。
  - Tradeoff:
    - 首次恢复后 30s 内相同问题不会重复刷屏，需要结合 metrics 观察频次。

## Known issues / follow-ups
- TODO: 在 staging 执行 `WORKER_DRILL_MODE=live` 并记录 MTTA/MTTR。
- TODO: smoke 脚本当前依赖本地 Redis/Postgres 可达，CI 环境需补充 service provisioning。

## Pitfalls / dead ends (do not repeat)
- Keep the detailed log in `05-pitfalls.md` (append-only).
