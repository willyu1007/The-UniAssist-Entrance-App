# 04 Verification

## Automated checks
- Executed (2026-02-23):
  - `pnpm typecheck:workspaces` -> PASS
  - `pnpm test:conformance` -> PASS
  - `DATABASE_URL=... REDIS_URL=... pnpm smoke:redis:e2e` -> PASS

## Manual smoke checks
- Executed (2026-02-23):
  1. 结构化日志检查：
     - 启动 `provider-plan/adapter-wechat/gateway/worker`，确认输出为 JSON 日志行（包含 `service` 字段）。
  2. 指标端点检查（临时 Postgres + Redis）：
     - `GET /v0/metrics` -> PASS（返回 ingest + provider + persistence + outbox 指标）
     - `GET /metrics` -> PASS（Prometheus 指标包含以下关键项）：
       - `uniassist_gateway_ingest_latency_p95_ms`
       - `uniassist_gateway_ingest_error_rate`
       - `uniassist_outbox_backlog_total`
       - `uniassist_outbox_dead_letter_total`
       - `uniassist_outbox_retry_rows_total`
  3. 规则文件检查：
     - `ops/observability/alerts/staging.rules.yml` 包含 5 条告警（P1/P2）。

## Sample outcome snapshot
- `/v0/metrics`:
  - `ingest.total=1`
  - `ingest.latencyP95Ms=8`
  - `outbox.backlogTotal=7`
  - `outbox.deadLetter=0`
- `/metrics` key lines present:
  - `uniassist_gateway_ingest_error_rate`
  - `uniassist_outbox_backlog_total`
  - `uniassist_outbox_dead_letter_total`

## Rollout / Backout
- Rollout:
  - 在 staging 先接入 dashboard，再加载告警规则并观察 1-2 天。
  - 再开启通知渠道（Pager/IM）。
- Backout:
  - 暂时仅关闭告警通知，不关闭指标采集与日志结构化输出。
