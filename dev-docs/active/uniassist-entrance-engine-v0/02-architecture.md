# 02 Architecture

## Context & current state
- 当前仓库只有 `apps/frontend`，未包含统一网关、协议包、渠道适配层。
- 需要在不承载专项领域逻辑的前提下，提供统一输入、路由分发、事件流与结构化交互运行时。

## Proposed design

### Components / modules
- `packages/contracts`:
  - v0 类型定义与 JSON schema（API/事件/交互/上下文）
- `apps/gateway`:
  - 统一入口 API（ingest/interact/stream/events/context）
  - 路由与 fallback（Top2 + 高阈值 + sticky）
  - 会话状态管理（统一会话 + 自动切分规则）
  - 事件存储与流推送（v0 先内存态 + SSE）
- `apps/frontend`:
  - Timeline 渲染器（核心事件 + provider_extension）
  - 来源标签、建议切换专项芯片、手动新建会话入口
- `apps/adapter-wechat`:
  - webhook 入站归一化 + 文本回传骨架

### Interfaces & contracts
- API endpoints:
  - `POST /v0/ingest`
  - `POST /v0/interact`
  - `GET /v0/stream?sessionId=&cursor=`
  - `POST /v0/events`
  - `GET /v0/context/users/{profileRef}`
- Data models / schemas:
  - `ContextPackage.profileRef`
  - `InteractionEvent.provider_extension`（`data_collection_*`）
- Events / jobs (if any):
  - `routing_decision`、`provider_run`、`interaction`、`user_interaction`、`domain_event`、`delivery_event`

### Boundaries & dependency rules
- Allowed dependencies:
  - frontend/gateway/adapter -> `@baseinterface/contracts`
- Forbidden dependencies:
  - gateway 不持有专项领域数据模型
  - frontend 不直接依赖专项系统私有协议

## Data migration (if applicable)
- Migration steps:
  - v0 采用内存态与 mock 数据，不引入仓库级 DB migration
- Backward compatibility strategy:
  - 保留现有聊天 UI 行为作为 fallback 展示路径
- Rollout plan:
  - 先本地 mock/contract 验证，再联调真实专项

## Non-functional considerations
- Security/auth/permissions:
  - v0 最低安全：外部入口 HMAC + timestamp/nonce 防重放
- Performance:
  - ingest ACK 目标 <= 800ms；fallback 首包 <= 5s
- Observability (logs/metrics/traces):
  - 每个事件带 `traceId/sessionId/runId/providerId`

## Open questions
- 专项 `profileRef` 拉取权限 scope 命名是否要在 v0 固化为枚举常量
- 主题漂移检测在 v0 的规则阈值是否需暴露为配置
