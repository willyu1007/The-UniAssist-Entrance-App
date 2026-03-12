# 03 Implementation Notes

## Current state
- `packages/workflow-contracts` 已补齐 control-console DTO：run list summary、approval queue/detail/decision、draft spec patch、console SSE invalidation。
- `apps/workflow-runtime` 已落 internal run summary / approval queue/detail / explicit approval decision 路由与 service/repository 支撑。
- `apps/workflow-platform-api` 已落 northbound `GET /v1/runs`、approval queue/detail/decision、`PATCH /v1/workflow-drafts/:draftId/spec`、`GET /v1/control-console/stream`，并补了浏览器可用所需最小 CORS。
- `apps/control-console` 已建成独立 `React + Vite + TypeScript` workspace，包含 `/runs`、`/approvals`、`/drafts`、`/studio` 四组路由、TanStack Query 数据层、SSE-first + polling fallback、Vitest smoke。

## Initial decisions
- `T-011` 与 `T-015` 是唯一上游规划基线；本 task 不重开控制台 IA、技术栈或 scope 决策。
- `apps/control-console` 首版以独立 workspace 运行，不接 gateway static hosting。
- approval action 走显式 platform endpoint，而不是前端拼装 runtime `resumeRun` 参数。
- console realtime 采用 SSE invalidation first；SSE 内容保持最小，只携带 query invalidation 所需标识。

## Notable landings
- control-console draft patch 使用 structured section patch，要求 `baseRevisionId + changeSummary`，并在成功后追加 `console_edit` revision。
- platform 层 `focusDraft` 现在会在当前 session 未链接 draft 时自动补 session link，使控制台可以安全打开并编辑现有 draft。
- runtime / platform integration tests 已覆盖：
  - run list
  - approval queue/detail/decision
  - draft spec patch 成功与 revision conflict
  - control-console SSE invalidation
- control-console app 已覆盖：
  - 四组 route smoke
  - explicit approval decision flow
  - draft patch + publish flow
  - SSE degrade -> polling fallback

## Post-review hardening
- platform runtime client 现在保留 runtime 原始 HTTP status，并映射为 `PlatformError`，避免 northbound 把 runtime `404/502/504` 误报为 `500`。
- `PATCH /v1/workflow-drafts/:draftId/spec` controller 已补 section-patch 边界校验，畸形 `metadata/requirements/nodes` payload 现在返回结构化 `400`，不会跌入 service 抛 `TypeError`。
- `Workflow Studio` 的 graph 编辑已把无效 JSON 解析失败收敛为表单级错误提示，不再把坏输入变成前端未处理异常。
- control-console 的 realtime 层已补 `stale` 检测与重连：SSE 在长时间无消息时会切回 polling，并在退避后重建连接；platform stream 同时增加 heartbeat frame 维持活性。

## Residual notes
- `apps/control-console` 当前仍是独立 workspace；后续若要接 gateway hosting，需要单独处理静态托管与 base URL 策略。
- 当前 CORS 策略为 internal/local baseline 的 permissive `*`；若后续引入 auth，需要和 gateway hosting 一起收紧。
