# 02 Architecture

## Scope boundaries
- In scope:
  - worker 状态机、重试、dead-letter、重放工具
- Out of scope:
  - 替换 Redis Streams 技术栈

## Core components
- Outbox claimer
- Retry dispatcher
- Consumer group worker
- Dead-letter replay CLI

## Key interfaces
- DB table: `outbox_events`
- Redis streams: `session stream + global stream`
- Worker env: retry/backoff/group/consumer tuning

## Key risks
- 竞争条件导致状态覆盖
- replay 与在线消费冲突
