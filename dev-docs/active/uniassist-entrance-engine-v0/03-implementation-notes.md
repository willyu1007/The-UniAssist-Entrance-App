# 03 Implementation Notes

## Status
- Current status: `in-progress (feature-complete scaffold)`
- Last updated: 2026-02-23

## What changed
- 新增 `packages/contracts`：
  - v0 核心类型（input/routing/interaction/timeline/context/domain）
  - `ContextPackage.profileRef`
  - `InteractionEvent.provider_extension` 三类扩展：
    - `data_collection_request`（强制 `dataSchema + uiSchema`）
    - `data_collection_progress`
    - `data_collection_result`（强制 `dataSchema + uiSchema`）
  - 对应 JSON schema 文件（`schemas/v0/*`）
- 新增 `apps/gateway`：
  - `POST /v0/ingest`
  - `POST /v0/interact`
  - `GET /v0/stream`
  - `GET /v0/timeline`
  - `POST /v0/events`
  - `GET /v0/context/users/:profileRef`
  - `GET /.well-known/uniassist/manifest.json`
- gateway 运行时行为实现：
  - Top2 路由评分
  - 未命中 fallback（builtin chat）
  - sticky provider + 衰减 + 切换建议
  - 会话自动切分（24h idle）
  - 主题漂移提示（轻量规则）
  - timeline 事件写入与 SSE 推送
  - 外部入口签名（HMAC + timestamp + nonce 防重放）
  - context 拉取鉴权（token + `context:read` scope）
- 新增 `apps/adapter-wechat`：
  - webhook 入站归一化为 `UnifiedUserInput`
  - 签名后转发 `/v0/ingest`
  - 文本回复骨架
- 新增 `apps/provider-plan`：
  - `GET /.well-known/uniassist/manifest.json`
  - `POST /v0/invoke`
  - `POST /v0/interact`
  - 端到端输出 `data_collection_request/progress/result`
- gateway 与 `plan` provider 集成：
  - 支持通过 `UNIASSIST_PLAN_PROVIDER_BASE_URL` 走真实 provider 调用
  - invoke 采用异步 dispatch，不阻塞 ingest ACK（满足快速 ACK 目标）
  - provider 不可用时自动回退到入口内置计划流程（不阻塞主链路）
- gateway 持久化实现（Postgres + Redis Streams）：
  - 新增 `apps/gateway/src/persistence.ts`
  - `DATABASE_URL` 可用时自动建表并持久化：
    - `sessions`
    - `timeline_events`
    - `provider_runs`
    - `user_context_cache`
    - `outbox_events`
  - `REDIS_URL` 可用时同步写入 stream（默认前缀 `uniassist:timeline:`）
  - timeline 读取支持“内存 + Postgres 合并”，支持重启后 cursor 恢复
  - context cache 支持落库和 TTL 读取
- DB SSOT 对齐：
  - 新增 `prisma/schema.prisma`
  - 运行 `ctl-db-ssot` 后刷新 `docs/context/db/schema.json`
- conformance tests：
  - 新增 `apps/gateway/tests/conformance.mjs`
  - 覆盖 fallback、结构化资料收集、profileRef、session split、sticky 切换、wechat adapter 闭环
  - 新增脚本：
    - `apps/gateway/package.json` -> `test:conformance`
    - `package.json` -> `test:conformance`
- 前端 `apps/frontend` 改造：
  - 单时间线渲染（轮询 `GET /v0/timeline`）
  - 来源标签展示
  - `provider_extension` 三类事件渲染
  - 切换建议芯片（`switch_provider:*`）
  - 抽屉会话管理二级入口“新建会话”
  - 新会话动作与 `new_session:*` 交互回传
- 文档更新：
  - 根 `README.md` 与 `AGENTS.md` 更新为统一入口定位
  - 本任务 `00/03/04` 文档同步到最新实现状态

## Files/modules touched (high level)
- `packages/contracts/*`
- `apps/gateway/*`
- `apps/adapter-wechat/*`
- `apps/provider-plan/*`
- `apps/gateway/src/persistence.ts`
- `apps/gateway/tests/conformance.mjs`
- `prisma/schema.prisma`
- `docs/context/db/schema.json`
- `docs/context/registry.json`
- `apps/frontend/app/index.tsx`
- `apps/frontend/src/components/AppDrawer.tsx`
- `apps/frontend/package.json`
- `apps/frontend/tsconfig.json`
- `README.md`
- `AGENTS.md`
- `dev-docs/active/uniassist-entrance-engine-v0/*`

## Decisions & tradeoffs
- Decision:
  - 在保持内存态低门槛的同时，增加可选 Postgres/Redis 持久化层（环境变量驱动）。
  - Rationale:
    - 兼顾本地开发和可恢复性，降低重启丢事件风险。
  - Alternatives considered:
    - 只保留内存态；放弃（无法满足持久化与恢复要求）。

- Decision:
  - `provider_extension` 使用受控扩展块并在 contract 强约束 request/result 渲染 schema 必填。
  - Rationale:
    - 保障专项结构化交互可统一渲染，避免私有渲染协议漂移。
  - Alternatives considered:
    - 完全自由 payload；放弃（前端无法保证一致渲染与回传）。

## Deviations from plan
- Change:
  - Phase 5 增加并完成 conformance tests；持久化从“目标”提升到“可运行可选实现”。
  - Why:
    - 用户明确要求按顺序落实“Postgres+Redis Streams”后执行 conformance。
  - Impact:
    - v0 验收项可自动化验证；系统具备重启恢复基础。

## Known issues / follow-ups
- TODO: Redis consumer group/outbox 重试 worker 仍未独立服务化（当前仅生产者侧写入）
- TODO: SSE 与 polling 的前端策略统一（避免双通道维护）
- TODO: 生产环境补全监控告警与数据库容量/归档策略

## Pitfalls / dead ends (do not repeat)
- Keep the detailed log in `05-pitfalls.md` (append-only).
