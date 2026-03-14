# 04 Verification

## Automated checks (executed)
1. Workspace typecheck
- Command: `pnpm typecheck:workspaces`
- Result: PASS

2. Gateway conformance
- Command: `pnpm test:conformance`
- Result: PASS
- Covered:
  - fallback 链路（no-hit）
  - `task_question/task_state` 主链路
  - `replyToken` 精准分发（故意错填 providerId/runId 仍命中目标任务）
  - 多 pending 时澄清卡片
  - `ready -> execute -> completed`
  - `/v0/events` `/v0/context` 的 scope 与重放校验

3. Redis e2e smoke
- Command:
  - `DATABASE_URL=postgresql://yurui@localhost:5432/postgres REDIS_URL=redis://127.0.0.1:6379 pnpm smoke:redis:e2e`
- Result: PASS
- Covered:
  - outbox pending -> consumed
  - retry 恢复
  - NOGROUP 自动恢复
  - dead-letter replay 幂等

4. DB SSOT context sync
- Command: `pnpm db:sync-context`
- Result: PASS（`docs/context/db/schema.json` 已刷新）

## Scenario checks
1. 多 pending 输入不带 token -> 返回任务选择卡片：PASS  
2. 带 `replyToken` 输入精准命中任务线程：PASS  
3. `task_state=ready` + `require_user_confirm` -> 执行确认后进入 `executing/completed`：PASS  
4. registry 驱动的 `/v0/events` 与 `/v0/context` 鉴权：PASS  

## Staging checks
- 未在本轮执行（本轮为本地实现与回归验证）。
