# 02 Architecture

## Scope boundaries
- In scope:
  - 指标、日志、告警、排障流程
- Out of scope:
  - 跨团队统一 observability 平台选型

## Telemetry model
- Metrics:
  - `gateway_ingest_latency_ms`
  - `gateway_ingest_error_total`
  - `outbox_backlog_count`
  - `worker_retry_total`
  - `worker_dead_letter_total`
- Logs:
  - 统一字段：`timestamp/level/service/traceId/sessionId/runId/message`

## Alert model
- P1: ingest 全面失败、dead_letter 激增
- P2: latency 超阈值、retry 持续升高
- P3: 单专项错误率升高

## Key risks
- 指标口径不一致
- 告警条件设置不合理
