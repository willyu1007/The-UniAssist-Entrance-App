# 02 Architecture

## Context & current state
- 当前主数据面已经明确由 Postgres/Prisma 承担。
- `T-016` 已规定 control console 统一走 `workflow-platform-api` 查询，不直连其他存储。
- 因此本子包唯一要回答的是：是否值得在后续为部分 projection/read models 引入 Convex。

## Proposed design

### Hard boundary
- Convex 不能承接：
  - `WorkflowRun` / `WorkflowNodeRun` authoritative state
  - `ApprovalRequest` / `ApprovalDecision` truth
  - `Artifact` authoritative persistence
  - command writes
  - audit ledger
- Convex 只可能承接：
  - projection/read models
  - subscription-friendly activity feeds
  - collaboration notifications

### Candidate read models
| Candidate | Why it might fit | Why it is not authoritative |
|---|---|---|
| Runboard live snapshot | 控制台需要实时感知 run/node blockers | 可由 authoritative run/node state 重建 |
| Approval inbox subscription | 审批队列变化适合订阅 | 真正审批状态仍以 `Approval*` authoritative objects 为准 |
| Draft activity feed | 协作编辑与修订提醒适合推送 | draft truth 仍在 control-plane draft objects |
| Collaboration notification stream | 通知类数据适合独立订阅 | 通知丢失不应影响主事实源 |

#### Candidate scope freeze
- 首版候选范围限定为：
  - control-console read models
  - collaboration/notification feeds
- 不扩展到：
  - authoritative workflow state
  - command path
  - 通用业务数据平面

### Sync principles
| Principle | Meaning |
|---|---|
| authoritative-first | 任何正式写入先落 Postgres/Prisma |
| command stays in platform API | 不允许直接向 Convex 发送正式命令写入 |
| projection can lag | 投影允许短暂延迟，但不能篡改事实对象 |
| rebuildability | Convex 中的数据必须可从 authoritative source 重建 |
| failure isolation | Convex 不可用时，主平台仍可运行，只降级实时投影体验 |

### Go criteria
- 控制台确实需要更高实时性，且 `workflow-platform-api` 自身 polling/SSE 无法满足
- 候选 read model 明确可重建、无主数据职责
- 同步链路和失败恢复成本可被接受
- 引入后不会破坏 query ownership 和审计边界

### No-go / exit criteria
- 需要让 Convex 持有 authoritative writes 才能成立
- 控制台关键功能因此绕开 `workflow-platform-api`
- 同步链路复杂到超出后续维护能力
- projection 丢失/延迟会造成业务真相混乱

### Fallback if no-go
- 继续由 `workflow-platform-api` 提供 query DTO
- 使用 polling/SSE 或其他轻量 projection 机制
- 不为 Convex 预留主路径依赖

### Query boundary if go
- 即使后续评估结果为 go，control console 也不直接以 Convex 替代 `workflow-platform-api`。
- 可接受的方式只有两类：
  - `workflow-platform-api` 继续提供聚合 query DTO，内部自行消费 projection
  - `workflow-platform-api` 额外提供受控订阅桥，统一暴露给控制台
- 不接受：
  - control console 直接绕开 platform API 订阅或读取 Convex
  - 让 Convex 成为新的命令面或控制面事实源

### Explicit exclusions
- 不在本子包中评估 Convex 作为主数据库。
- 不在本子包中引入具体 SDK 或 infra。
- 不在本子包中改变控制台的统一 query surface。

## Data migration (if applicable)
- Migration steps:
  - 无 authoritative migration
  - 仅在后续若 go，才设计 projection sync
- Backward compatibility strategy:
  - no-go 时保持现有计划不变
- Rollout plan:
  - 只有在控制台和 connector 边界稳定后才进入实评

## Non-functional considerations
- Reliability:
  - projection failure 不应影响 workflow execution
- Operability:
  - 引入额外存储/同步链路必须有清晰的排障路径
- Auditability:
  - 所有正式决策仍必须能回到 authoritative store 审计

## Risks and rollback strategy

### Primary risks
- 团队把 Convex 当成“实时性焦虑”的总解
- read model ownership 被打散
- 后续实现被迫维护双写或复杂补偿

### Rollback strategy
- 一旦评估发现必须双写 authoritative data，则直接 no-go
- 如果只是一两个 feed 需要更强订阅，可先局部实验，不扩大为平台承诺
- 若实验成本过高，回退到 `workflow-platform-api + polling/SSE`

## Open questions
- 当前无高影响开放问题；后续若继续细化，优先进入实验 admission criteria、projection sync 方案和 subscription bridge 形态，而不是重开 Convex 角色边界
