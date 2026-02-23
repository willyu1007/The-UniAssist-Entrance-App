# 03 Implementation Notes

## Status
- Current status: `in-progress`
- Last updated: 2026-02-23

## What changed
- 新增共享结构化日志包：
  - `packages/shared/src/logger.ts`
  - `packages/shared/package.json`
- 服务统一接入 JSON 日志：
  - `apps/gateway/src/server.ts`
  - `apps/gateway/src/persistence.ts`
  - `apps/worker/src/worker.ts`
  - `apps/provider-plan/src/server.ts`
  - `apps/adapter-wechat/src/server.ts`
- gateway 新增可观测指标能力：
  - `apps/gateway/src/observability.ts`
  - `GET /v0/metrics`（JSON）
  - `GET /metrics`（Prometheus text）
  - 指标覆盖 ingest latency/error rate、outbox backlog/retry/dead_letter、provider invoke/interact 错误数
- 新增 observability 运维资产：
  - `ops/observability/README.md`
  - `ops/observability/alerts/staging.rules.yml`
  - `ops/observability/runbooks/incident-playbook.md`
- 新增告警校验与演练脚本：
  - `ops/observability/scripts/validate-alert-rules.mjs`
  - `ops/observability/scripts/staging-alert-drill.mjs`
  - `ops/observability/staging/prometheus.rules.load.example.yml`
  - `ops/observability/staging/alertmanager.receivers.example.yml`
- README 与 ops 索引更新：
  - `README.md`
  - `ops/README.md`
  - 根 `package.json` 增加命令：
    - `pnpm observability:alerts:validate`
    - `pnpm observability:drill:staging`

## Decisions & tradeoffs
- Decision:
  - 指标先集中由 gateway 暴露（通过 DB 查询 outbox 状态），不先引入独立 metrics 聚合服务。
  - Rationale:
    - 低改造成本即可满足 v1 前期可观测需求。
  - Tradeoff:
    - worker 自身 runtime 指标粒度暂弱于 gateway 侧聚合指标。

- Decision:
  - 统一采用 JSON structured logging（含 `timestamp/level/service/message`）。
  - Rationale:
    - 便于日志平台检索和跨服务关联。
  - Tradeoff:
    - 本地开发日志可读性略低于纯文本。

## Known issues / follow-ups
- TODO: 将 `ops/observability/alerts/staging.rules.yml` 导入真实监控系统并联通通知渠道。
- TODO: 完成一次“告警触发 -> runbook 处理 -> 恢复”的真实演练并记录 MTTR（目前已完成 table-top + simulate drill）。
- TODO: worker 清理阶段偶发 `NOGROUP` 错误日志噪音，需在 T-004 做降噪处理。

## Pitfalls / dead ends (do not repeat)
- Keep the detailed log in `05-pitfalls.md` (append-only).
