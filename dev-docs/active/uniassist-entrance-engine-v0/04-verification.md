# 04 Verification

## Automated checks
- Executed (2026-02-23):
  - `pnpm typecheck:workspaces` -> PASS
  - `pnpm --filter @baseinterface/contracts typecheck` -> PASS
  - `pnpm --filter @baseinterface/gateway typecheck` -> PASS
  - `pnpm --filter @baseinterface/adapter-wechat typecheck` -> PASS
  - `pnpm --filter @baseinterface/provider-plan typecheck` -> PASS
  - `pnpm --filter @baseinterface/frontend typecheck` -> PASS

## Manual smoke checks
- Executed (local, 2026-02-23):
  1. ingest no-hit -> fallback:
     - 输入普通文本
     - 结果：ACK 返回 `fallback=builtin_chat`，timeline 中出现 `routing_decision + provider_run(fallback) + interaction`
  2. data collection 扩展闭环：
     - 输入“计划”语义 -> `data_collection_request`
     - 调用 `/v0/interact` action=`submit_data_collection`
     - 结果：timeline 出现 `data_collection_progress + data_collection_result`
  3. profileRef 拉取鉴权：
     - `GET /v0/context/users/{profileRef}` + `Authorization` + `x-provider-scopes: context:read` -> 200
     - 缺少 scope -> 403
     - `provider_run` 事件 payload 中包含 `context.profileRef`
  4. WeChat 适配链路：
     - `POST /wechat/webhook`
     - 结果：adapter 正常转发 gateway ingest 并返回文本回复骨架
  5. 真实专项接入（plan provider）：
     - 启动 `apps/provider-plan`
     - 配置 `UNIASSIST_PLAN_PROVIDER_BASE_URL`
     - ingest 计划类输入后，timeline 收到 provider 的 ack + `data_collection_request`
     - interact 回传后，timeline 收到 provider 的 `progress/result`

## Sample outcome snapshot

- `fallback`: `"builtin_chat"`
- `extensionKinds`: `["data_collection_request","data_collection_progress","data_collection_result"]`
- `contextNoScopeCode`: `403`
- `wechat.ok`: `true`
- `providerAckFromPlan`: `true`

## Rollout / Backout (if applicable)
- Rollout:
  - 当前可用于本地联调：frontend + gateway + adapter + contracts
  - 下一步接入真实 provider 服务与持久化基础设施
- Backout:
  - 前端不配置 `EXPO_PUBLIC_GATEWAY_BASE_URL` 时自动回退本地 mock 交互流
