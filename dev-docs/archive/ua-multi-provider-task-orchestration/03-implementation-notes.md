# 03 Implementation Notes

## Status
- Current status: `in-progress`
- Last updated: 2026-03-06

## What changed
1. Contracts (`packages/contracts/src/types.ts`)
- 新增任务态协议类型：
  - `TaskExecutionPolicy`, `TaskLifecycleState`
  - `provider_extension.task_question`
  - `provider_extension.task_state`
- `UserInteraction` 增加 `replyToken` 与 `inReplyTo`。
- `ProviderEventsRequest` 增加 `kind=task_state` 事件模型。

2. Gateway orchestrator (`apps/gateway/src/server.ts`)
- 引入 provider registry（默认 `plan/work/reminder`，支持 `UNIASSIST_PROVIDER_REGISTRY_JSON` 覆盖）。
- 调用链改为通用 provider client：`invoke/interact` 共用重试、超时、熔断和错误映射。
- 实现任务线程编排：
  - 归一化旧 `data_collection_* -> task_question/task_state`
  - 持久化 `task_threads`
  - 分发优先级：`replyToken > single pending > multi pending clarify > semantic routing`
  - `ready` 态按 `executionPolicy` 处理：自动执行或确认卡片。
- `/v0/events`、`/v0/context/users/:profileRef` 鉴权 subject 改为 registry 驱动。

3. Gateway persistence + DB SSOT
- `prisma/schema.prisma` 新增 `task_threads` 模型。
- `apps/gateway/src/persistence.ts` 新增：
  - 表初始化与索引：`task_threads`
  - `saveTaskThread` / `listTaskThreads`
- 同步 DB context：`docs/context/db/schema.json`。

4. Provider-plan (`apps/provider-sample/src/server.ts`)
- `invoke` 返回首个 `task_question(goal)`。
- `interact` 支持多轮问答并输出：
  - `task_question(dueDate)`（信息不足）
  - `task_state(ready)`（信息完整）
  - `task_state(executing/completed)`（执行流程）
- manifest 升级为 `security.auth=client_credentials`。

5. Frontend (`apps/frontend/app/index.tsx`)
- 新增任务线程状态：
  - `taskThreads`、`activeTask`
  - `pendingTasks` 计算
- 新增渲染：
  - `task_question` 任务提问卡片（继续任务）
  - `task_state` 状态卡片（`ready + require_user_confirm` 时可确认执行）
- 输入发送支持任务精确回复：
  - `activeReplyToken` 自动绑定到 `/v0/interact`
  - 多 pending 时先弹任务选择，再发送
  - 输入栏展示当前聚焦任务。

6. Conformance (`apps/gateway/tests/conformance.mjs`)
- 替换旧 `data_collection_*` 场景为 T-009 场景：
  - `task_question/task_state`
  - `replyToken` 精准命中
  - 多 pending 澄清卡片
  - `ready -> execute` 链路。

## Decisions & tradeoffs
- 执行策略采用 provider 声明：`auto_execute` / `require_user_confirm`。
- 不新增 `/v0/execute`，复用 `/v0/interact(actionId=execute_task)`。
- 保留旧 `data_collection_*` 一个版本周期，通过 gateway 归一化兼容。
- 当前 conformance 保留“手动切换 provider”校验，不强依赖自动切换提示出现（避免未配置 provider 的 fallback 任务态干扰测试稳定性）。

## Known issues / follow-ups
- registry 中未配置 `baseUrl` 的 provider 会走本地 fallback，并生成默认 `task_question`，这会改变同 session 后续分发路径（属于设计行为，已在测试中规避关键词干扰）。
- `UNIASSIST_INTERNAL_AUTH_REPLAY_BACKEND=redis` 目前 gateway/provider 仍提示使用内存 nonce store（T-006 已知限制）。

## Pitfalls / dead ends (do not repeat)
- Keep the detailed log in `05-pitfalls.md` (append-only).
