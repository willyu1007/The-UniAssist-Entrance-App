# 01 Plan

## Phases
1. Current-state and authoritative boundary extraction
2. Object inventory freeze
3. Lifecycle and projection freeze
4. Compatibility and handoff freeze

## Detailed steps
- 抽取现状：
  - 明确当前 Prisma SSOT 中哪些表承载事实对象，哪些只是兼容对象
  - 对照 `T-012` 的 formal event / projection 边界
- 冻结正式对象集：
  - core: `WorkflowTemplate`, `WorkflowTemplateVersion`, `WorkflowRun`, `WorkflowNodeRun`, `Artifact`, `ApprovalRequest`, `ApprovalDecision`
  - companion: `ActorProfile`, `ActorMembership`, `AudienceSelector`, `DeliverySpec`, `DeliveryTarget`
- 冻结生命周期与关系：
  - run/node/artifact/approval 状态
  - actor membership / delivery target 状态
  - artifact 与 delivery spec 的 binding 规则
- 冻结 projection 与兼容：
  - `TimelineEvent`, `task_question`, `task_state` 的映射来源
  - runboard / approval inbox 作为 read model 的边界

## Risks & mitigations
- Risk:
  - 只定义对象名，没有定义 authoritative owner 和状态
  - Mitigation:
    - 强制在 `02-architecture.md` 中给出 ownership matrix 与 lifecycle table
- Risk:
  - 过度抽象 actor graph，脱离首批验证场景和 fan-out 需求
  - Mitigation:
    - 只保留首批验证场景和控制台需要的最小关系原语
- Risk:
  - 把 delivery/channel payload 设计过深，提前绑定后续 connector 方案
  - Mitigation:
    - `P1` 只冻结 delivery intent、target resolution 和 artifact binding，不冻结 channel adapter 细节
