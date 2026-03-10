# 03 Implementation Notes

## Current state
- This subtask is evaluation-only.
- No Convex dependency, sync pipeline, or projection implementation has been started in this task.

## Initial decisions
- 本子包是 `T-011` 下的后置评估子包，不进入当前主线实施。
- authoritative store 固定为 Postgres/Prisma，不因本子包改变。
- Convex 只评估 projection/read-model 和订阅类场景。
- 即使后续采用 Convex，正式命令写入仍留在 `workflow-platform-api`。
- 若评估结论不充分，默认 no-go。
- 候选 read models 范围限定为 control-console read models 与 collaboration/notification feeds。
- 即使后续 go，control console 仍通过 `workflow-platform-api` 或其受控订阅桥消费数据，不直连 Convex。

## Deferred decisions
- 具体同步方式
- subscription bridge 的具体形态

## Follow-up TODOs
- 在 `T-017` 稳定后再启动正式评估
- 用本子包结果决定是否创建后续实验/implementation task
