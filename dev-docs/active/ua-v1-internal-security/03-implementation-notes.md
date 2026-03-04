# 03 Implementation Notes

## Status
- Current status: `in-progress`
- Last updated: 2026-03-04

## What changed
- `packages/shared` 新增 `internal-auth` 模块（HS256 JWT、请求签名、nonce 防重放、scope 校验、`off/audit/enforce` 模式配置）。
- `packages/contracts` 增加内部安全公共类型：`InternalServiceId`、`InternalScope`、`InternalAuthConfig`、`InternalAuthHeaders`、统一错误码枚举。
- `apps/gateway`：
  - `/v0/ingest(source!=app)` 接入 internal-auth（保留外部 HMAC 签名校验）
  - `/v0/events`、`/v0/context/users/:profileRef` 接入 internal-auth + scope
  - gateway -> provider (`/v0/invoke`, `/v0/interact`) 增加 JWT+签名头
  - 新增 internal auth observability 指标（requests/denied/replay）
- `apps/provider-plan`：
  - `/v0/invoke` 需要 `provider:invoke`
  - `/v0/interact` 需要 `provider:interact`
  - manifest `security.auth` 从 `none` 调整为 `client_credentials`
- `apps/adapter-wechat`：转发到 gateway 时在既有外部签名基础上新增 internal JWT+签名头。
- 文档与运维：
  - 更新 `README.md` 内部安全环境变量与 staging 验证指令
  - 更新 `ops/deploy/staging/env.example` 与 `ops/deploy/staging/runbook.md`
  - 更新 `ops/deploy/scripts/staging-post-deploy-check.mjs` 支持 internal-auth 验证路径（兼容 legacy token fallback）
- 测试：`apps/gateway/tests/conformance.mjs` 切到 `enforce` 模式并新增 `/v0/events`、`/v0/context` scope 覆盖。

## Decisions & tradeoffs
- 按冻结决策采用 `HS256 + kid` 双密钥窗口模型，不引入外部 IdP/JWKS。
- `UNIASSIST_INTERNAL_AUTH_REPLAY_BACKEND=redis` 目前仅记录 warning 并回退内存 nonce store（首版不引入额外 Redis 依赖）。
- `/v0/interact`（前端用户交互入口）不纳入 internal-auth 强制范围，避免误伤用户侧链路。

## Known issues / follow-ups
- staging 尚未完成 `audit -> enforce` 真实切换留证。
- `kid` 轮换实战演练与回放记录待补。

## Pitfalls / dead ends (do not repeat)
- Keep the detailed log in `05-pitfalls.md` (append-only).
