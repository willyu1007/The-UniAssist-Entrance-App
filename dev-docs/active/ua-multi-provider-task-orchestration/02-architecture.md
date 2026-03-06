# 02 Architecture

## Interaction model
- 双通道模型：
  - 体验通道：`ack/assistant_message`
  - 任务通道：`task_question/task_state`
- 任务状态机：`collecting -> ready -> executing -> completed|failed`

## Routing priority
1. `replyToken` 精确命中
2. 单 pending question 自动命中
3. 多 pending question 返回澄清卡片
4. 无 pending 时走语义路由

## Provider orchestration
- Registry 统一描述 provider：`providerId/baseUrl/serviceId/capabilities/requiredScopes`。
- Client 统一调用：`invoke/interact/events`。
- 调用韧性：超时 + 重试 + 熔断 + 错误语义映射。

## Persistence changes
- 新增 `task_threads`：`task_id/session_id/provider_id/run_id/state/execution_policy/active_question_id/active_reply_token/updated_at/metadata`。
- Prisma SSOT 与 gateway SQL init 同步更新。

## Security matrix
- scope 维持：`context:read`、`events:write`、`provider:invoke`、`provider:interact`。
- `allowedSubjects` 由 registry 生成，不再硬编码 `provider-plan`。
