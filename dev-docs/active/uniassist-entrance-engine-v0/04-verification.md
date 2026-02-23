# 04 Verification

## Automated checks
- Executed (2026-02-23):
  - `pnpm typecheck:workspaces` -> PASS
  - `pnpm --filter @baseinterface/contracts typecheck` -> PASS
  - `pnpm --filter @baseinterface/gateway typecheck` -> PASS
  - `pnpm --filter @baseinterface/adapter-wechat typecheck` -> PASS
  - `pnpm --filter @baseinterface/provider-plan typecheck` -> PASS
  - `pnpm --filter @baseinterface/worker typecheck` -> PASS
  - `pnpm --filter @baseinterface/frontend typecheck` -> PASS
  - `pnpm --filter @baseinterface/gateway test:conformance` -> PASS
  - `pnpm test:conformance` -> PASS
  - `DATABASE_URL=... REDIS_URL=... pnpm smoke:redis:e2e` -> PASS

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
  6. Postgres 持久化：
     - 配置 `DATABASE_URL=postgresql://localhost:5432/uniassist_gateway`
     - ingest 后验证 `sessions/timeline_events/provider_runs/outbox_events` 行数增加
     - 重启 gateway 后，`/v0/timeline` 仍可按 cursor 拉取历史事件（恢复成功）
  7. Redis 端到端投递闭环（worker）：
     - 本机启动临时 Redis（6380）+ 临时 Postgres DB
     - 执行 `pnpm smoke:redis:e2e`
     - 结果：`[smoke][PASS] Redis worker pipeline is healthy`
     - 验证点：
       - baseline outbox 由 pending/processing 最终进入 consumed
       - 注入 failed outbox 记录后，retry 路径可恢复并 consumed
       - session/global stream 均有数据

## Sample outcome snapshot

- `fallback`: `"builtin_chat"`
- `extensionKinds`: `["data_collection_request","data_collection_progress","data_collection_result"]`
- `contextNoScopeCode`: `403`
- `wechat.ok`: `true`
- `providerAckFromPlan`: `true`
- `postgresCounts`: `sessions=1,timeline_events=4,provider_runs=1,outbox_events=4`
- `recoveryAfterRestart`: `events=4`
- `redisE2E`: `PASS`
- `retryRow`: `status=consumed,attempts=2`
- `streamEntries`: `sessionLen=8,globalLen=8`

## Rollout / Backout (if applicable)
- Rollout:
  - 当前可用于本地联调：frontend + gateway + adapter + contracts
  - 已支持可选 Postgres/Redis + 独立 worker；建议先在 staging 验证回放与吞吐
- Backout:
  - 不配置 `DATABASE_URL/REDIS_URL` 时 gateway 自动回退纯内存模式
  - 前端不配置 `EXPO_PUBLIC_GATEWAY_BASE_URL` 时自动回退本地 mock 交互流
