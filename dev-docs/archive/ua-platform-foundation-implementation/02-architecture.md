# 02 Architecture

## Scope
- New modules:
  - `apps/workflow-platform-api`
  - `apps/workflow-runtime`
  - `packages/workflow-contracts`
  - `packages/executor-sdk`
- Touched modules:
  - `apps/gateway`
  - `apps/worker`
  - `prisma/schema.prisma`

## Fixed boundaries
- `workflow-platform-api` 负责统一命令/查询入口，不做 `/v0` projection。
- `workflow-runtime` 负责 run/node 状态推进、compat executor 调用、formal event 产出。
- `gateway` 负责 workflow entry hit 判定与 `/v0` projection。
- `worker` 负责 workflow formal event 的 outbox/retry/fan-out，不拥有业务状态机。

## Runtime shape
- Node set 固定为：
  - `executor`
  - `approval_gate`
  - `end`
- Transition set 固定为：
  - `success`
  - `needs_input`
  - `needs_approval`
  - `approved`
  - `rejected`
  - `failed`
- 不支持：
  - 并发节点
  - 循环
  - fan-out delivery 编排
  - connector / bridge / draft control-plane

## Compatibility path
- gateway workflow entry registry 命中后，仍对外保留 compat `providerId` + `runId`。
- `workflow-platform-api` 的 `start-run/resume-run` 响应返回 `run snapshot + emitted formal events`。
- gateway 通过 internal workflow events route 把 formal events 投影成 `/v0` timeline、`task_question`、`task_state`。

## Data plane
- Core objects:
  - `WorkflowTemplate`
  - `WorkflowTemplateVersion`
  - `WorkflowRun`
  - `WorkflowNodeRun`
  - `Artifact`
  - `ApprovalRequest`
  - `ApprovalDecision`
- Companion objects:
  - `ActorProfile`
  - `ActorMembership`
  - `AudienceSelector`
  - `DeliverySpec`
  - `DeliveryTarget`

## Persistence rule
- Prisma schema 是 DB SSOT。
- 业务服务不导入 Prisma client；统一通过 `pg` repository 访问。
- 新表通过 migration 建立，不为 B1 新表增加 ad-hoc SQL auto-init。
