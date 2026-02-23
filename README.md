# The-UA-Entrance-APP (UniAssist Entrance Engine)

统一入口项目（v0）：负责多专项 AI 能力的输入接入、路由分发、交互聚合、未命中兜底、外部渠道承接与导航承载。

## Project Goal

本仓库不是专项业务实现仓库，而是统一入口引擎：

1. 分发：判断用户输入命中哪个专项（可多命中），并将输入分发到专项系统
2. 聚合：接收专项即时交互事件并统一展示
3. 兜底：未命中或待确认时使用内置聊天能力承接
4. 承接外部输入：当前 v0 支持微信文本接入骨架
5. 承载长周期反馈：专项可回推 domain event 到统一时间线
6. 导航入口：在统一界面提供专项设置/详情/进度入口承载能力

## Current Status

- 初始化流程已完成（无 `init/` 目录）
- v0 合同层已落地：`packages/contracts`
- v0 网关已落地：`apps/gateway`
- 微信适配层骨架已落地：`apps/adapter-wechat`
- `plan` 专项 Provider 已落地：`apps/provider-plan`
- delivery worker 已落地：`apps/worker`（outbox retry + Redis consumer）
- 前端已接入统一时间线与扩展事件渲染：`apps/frontend`

## Tech Stack

| Category | Technology |
|---|---|
| Language | TypeScript |
| Package Manager | pnpm |
| Repo Layout | Monorepo |
| Frontend | Expo + React Native |
| Gateway / Adapter | Node.js + Express |
| Realtime | SSE (v0) |
| Persistence (target) | Postgres + Redis Streams + Object Storage |

## Runtime Interfaces (v0)

- `POST /v0/ingest`
- `POST /v0/interact`
- `GET /v0/stream?sessionId=&cursor=`
- `GET /v0/timeline?sessionId=&cursor=` (frontend polling helper)
- `POST /v0/events`
- `GET /v0/context/users/{profileRef}`
- `GET /v0/metrics` (JSON)
- `GET /metrics` (Prometheus text)
- `GET /.well-known/uniassist/manifest.json`

## Workspace Structure

```txt
apps/
  frontend/          Expo App (统一入口 UI)
  gateway/           入口网关（路由、兜底、会话、事件流）
  adapter-wechat/    微信适配层（入站归一化与回传骨架）
  provider-plan/     示例专项（invoke/interact/manifest）
  worker/            投递工作进程（outbox retry + stream consumer）
packages/
  contracts/         v0 协议类型与 JSON Schema
  shared/            共享包预留
dev-docs/            任务文档与实施记录
.ai/                 技能与治理脚本
```

## Quick Start

### Prerequisites

- Node.js >= 18
- pnpm

### Install

```bash
pnpm install
```

### Start Services

```bash
# Frontend
pnpm --filter @baseinterface/frontend start

# Gateway (default :8787)
pnpm --filter @baseinterface/gateway start

# WeChat adapter (default :8788)
pnpm --filter @baseinterface/adapter-wechat start

# Plan provider (default :8890)
pnpm --filter @baseinterface/provider-plan start

# Worker (default no port)
pnpm --filter @baseinterface/worker start
```

### Frontend Environment

设置前端连接网关：

```bash
EXPO_PUBLIC_GATEWAY_BASE_URL=http://localhost:8787
UNIASSIST_PLAN_PROVIDER_BASE_URL=http://localhost:8890
```

### Gateway Persistence Environment

网关默认以内存模式运行；设置以下变量后自动启用持久化：

```bash
# Postgres (durable sessions/timeline/provider_runs/outbox/context_cache)
DATABASE_URL=postgresql://localhost:5432/uniassist_gateway

# Redis Streams (optional)
REDIS_URL=redis://localhost:6379
UNIASSIST_STREAM_PREFIX=uniassist:timeline:

# optional: enable inline dispatch in gateway (default false, recommended false)
UNIASSIST_OUTBOX_INLINE_DISPATCH=false
```

### Worker Environment

```bash
DATABASE_URL=postgresql://localhost:5432/uniassist_gateway
REDIS_URL=redis://localhost:6379
UNIASSIST_STREAM_PREFIX=uniassist:timeline:
UNIASSIST_STREAM_GLOBAL_KEY=uniassist:timeline:all
UNIASSIST_STREAM_GROUP=ua-delivery

# outbox retry tuning
OUTBOX_POLL_MS=1000
OUTBOX_BATCH_SIZE=100
OUTBOX_MAX_ATTEMPTS=12
OUTBOX_BACKOFF_BASE_MS=1000
OUTBOX_BACKOFF_MAX_MS=300000

# consumer tuning
STREAM_CONSUMER_BLOCK_MS=2000
STREAM_CONSUMER_BATCH_SIZE=100
```

## Verification

```bash
pnpm --filter @baseinterface/contracts typecheck
pnpm --filter @baseinterface/gateway typecheck
pnpm --filter @baseinterface/adapter-wechat typecheck
pnpm --filter @baseinterface/provider-plan typecheck
pnpm --filter @baseinterface/worker typecheck
pnpm --filter @baseinterface/frontend typecheck
pnpm test:conformance
```

### Redis E2E Smoke (outbox retry + consumer)

需要可用的 Postgres 和 Redis，然后执行一条命令：

```bash
DATABASE_URL=postgresql://localhost:5432/uniassist_gateway \
REDIS_URL=redis://localhost:6379 \
pnpm smoke:redis:e2e
```

脚本会自动：
- 启动 `provider-plan` / `gateway` / `worker`
- 发起一次 ingest，验证 outbox 从 pending 流转到 consumed
- 注入一条 `failed` outbox 记录，验证 retry 路径可恢复并最终 consumed
- 校验 Redis session/global stream 有数据
- 默认清理测试产生的 DB/Redis 数据

可选环境变量：
- `SMOKE_GATEWAY_PORT`（默认 `18877`）
- `SMOKE_PROVIDER_PORT`（默认 `18890`）
- `SMOKE_TIMEOUT_MS`（默认 `40000`）
- `SMOKE_STREAM_PREFIX`（默认按本次 run 自动生成）
- `SMOKE_STREAM_GROUP`（默认按本次 run 自动生成）
- `SMOKE_KEEP_ARTIFACTS=true`（保留测试数据用于排查）

### Staging Release Gate

发布前门禁：

```bash
DATABASE_URL=postgresql://localhost:5432/uniassist_gateway \
REDIS_URL=redis://localhost:6379 \
pnpm release:gate:staging
```

发布后验证：

```bash
STAGING_GATEWAY_BASE_URL=http://localhost:8787 \
STAGING_PROVIDER_PLAN_BASE_URL=http://localhost:8890 \
STAGING_ADAPTER_WECHAT_BASE_URL=http://localhost:8788 \
STAGING_CONTEXT_TOKEN=provider-dev-token \
pnpm release:verify:staging
```

详细流程见：
- `ops/deploy/staging/runbook.md`
- `ops/deploy/staging/env.example`

### Observability Baseline

Gateway 指标端点：

```bash
curl -s http://localhost:8787/v0/metrics
curl -s http://localhost:8787/metrics
```

已内置关键指标：
- ingest latency p95 / error rate
- outbox backlog / failed / dead_letter / retry
- provider invoke/interact error totals

Staging 告警规则草案：
- `ops/observability/alerts/staging.rules.yml`
- `ops/observability/runbooks/incident-playbook.md`

告警规则校验与演练：

```bash
pnpm observability:alerts:validate
STAGING_GATEWAY_BASE_URL=http://localhost:8787 pnpm observability:drill:staging
```

## Notes

- v0 默认内存态；配置 `DATABASE_URL` 后启用 Postgres 持久化
- 配置 `REDIS_URL` 后，gateway 会写入 outbox；由 `apps/worker` 重试投递到 Redis Streams
- `apps/worker` 同时消费全局 stream（consumer group）并回写 outbox consumed 状态
- 外部入口启用最低安全：HMAC + timestamp + nonce 防重放
- 内部完整签名/JWT 属于后续版本目标
