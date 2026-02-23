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
- `GET /.well-known/uniassist/manifest.json`

## Workspace Structure

```txt
apps/
  frontend/          Expo App (统一入口 UI)
  gateway/           入口网关（路由、兜底、会话、事件流）
  adapter-wechat/    微信适配层（入站归一化与回传骨架）
  provider-plan/     示例专项（invoke/interact/manifest）
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
```

## Verification

```bash
pnpm --filter @baseinterface/contracts typecheck
pnpm --filter @baseinterface/gateway typecheck
pnpm --filter @baseinterface/adapter-wechat typecheck
pnpm --filter @baseinterface/provider-plan typecheck
pnpm --filter @baseinterface/frontend typecheck
```

## Notes

- v0 默认内存态；配置 `DATABASE_URL` 后启用 Postgres 持久化
- 配置 `REDIS_URL` 后，timeline 事件会同步写入 Redis Streams
- 外部入口启用最低安全：HMAC + timestamp + nonce 防重放
- 内部完整签名/JWT 属于后续版本目标
