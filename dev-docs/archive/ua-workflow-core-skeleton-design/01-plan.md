# 01 Plan

## Phases
1. Current-state extraction
2. Service/interface freeze
3. Object/state boundary freeze
4. Compatibility/risk freeze

## Detailed steps
- 抽取现状：
  - 明确当前 `gateway` 承接的 `/v0` 入口、timeline、session、provider path
  - 明确当前 `worker` 承接的 outbox/retry/stream consumer 职责
  - 明确当前 Prisma SSOT 与持久化表边界
- 冻结服务边界：
  - `workflow-platform-api` 作为统一命令入口和统一查询入口
  - `workflow-runtime` 作为 run/node 推进器
  - `ingress-gateway` 只做 `/v0` 兼容入口与 timeline/chat 投影
  - `worker` 负责 continuation/timer/retry 的后台执行
- 冻结接口路径：
  - `/v1` 最小查询/命令面
  - internal HTTP command 面
  - `/v0` 命中 workflow 的 handoff 边界
- 冻结对象与状态边界：
  - `WorkflowTemplate`
  - `WorkflowTemplateVersion`
  - `WorkflowRun`
  - `WorkflowNodeRun`
  - `Artifact`
  - `ApprovalRequest`
  - `ApprovalDecision`
- 冻结兼容与风险策略：
  - `task_question/task_state` 映射
  - `providerId` 兼容意义
  - formal events 与 timeline projection 分层
  - 回退到 legacy provider path 的路径

## Risks & mitigations
- Risk:
  - 文档只描述理想状态，没有解释如何从当前 repo 过渡
  - Mitigation:
    - 强制写出 `/v0` compatibility mapping 和 rollback
- Risk:
  - runtime、worker、gateway 之间边界仍有重叠
  - Mitigation:
    - 在 `02-architecture.md` 中为每个服务写“负责/不负责”清单
- Risk:
  - `P1` 对象集扩大到 agent/trigger/policy 全量设计
  - Mitigation:
    - 把排除项写成硬边界，并说明为什么后置
