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
- `apps/frontend/app/index.tsx`
- `apps/frontend/src/components/AppDrawer.tsx`
- `apps/frontend/package.json`
- `apps/frontend/tsconfig.json`
- `README.md`
- `AGENTS.md`
- `dev-docs/active/uniassist-entrance-engine-v0/*`

## Decisions & tradeoffs
- Decision:
  - v0 先采用内存态事件存储和轮询辅助接口（`/v0/timeline`），优先闭环协议与交互。
  - Rationale:
    - 先保证产品链路可跑通，再推进持久化与高可用。
  - Alternatives considered:
    - 直接落 Postgres + Redis Streams；本轮放弃（范围过大，不利于快速验证接口契约）。

- Decision:
  - `provider_extension` 使用受控扩展块并在 contract 强约束 request/result 渲染 schema 必填。
  - Rationale:
    - 保障专项结构化交互可统一渲染，避免私有渲染协议漂移。
  - Alternatives considered:
    - 完全自由 payload；放弃（前端无法保证一致渲染与回传）。

## Deviations from plan
- Change:
  - Phase 5（hardening）仅完成 smoke/typecheck，尚未补齐 conformance test 与生产级存储。
  - Why:
    - 本轮聚焦可运行闭环与接口定型。
  - Impact:
    - 可用于联调与演示，不建议直接生产上线。

## Known issues / follow-ups
- TODO: 对 `provider_extension` 建立独立 conformance tests
- TODO: gateway 从内存态切换到 Postgres + Redis Streams + outbox
- TODO: SSE 与 polling 的前端策略统一（避免双通道维护）

## Pitfalls / dead ends (do not repeat)
- Keep the detailed log in `05-pitfalls.md` (append-only).
