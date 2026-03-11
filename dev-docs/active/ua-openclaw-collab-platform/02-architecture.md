# 02 Architecture

## Context & current state
- 当前仓库已经具备统一入口最小闭环：
  - `apps/gateway` 承接 `/v0/ingest`, `/v0/interact`, `/v0/events`, `/v0/stream`, `/v0/timeline`
  - `apps/provider-sample` 仍是固定场景 provider 示例
  - `apps/frontend` 是 chat/timeline 体验
  - `apps/worker` 负责 outbox retry + Redis consumer
- 当前持久化中心仍是 `sessions`, `timeline_events`, `provider_runs`, `outbox_events`。
- `docs/project/db-ssot.json` 与 `prisma/schema.prisma` 已明确当前 DB SSOT 是 Prisma/Postgres。

## Proposed design

### Components / modules
- Existing compatibility layer:
  - `apps/gateway` -> 演进为 `ingress-gateway`
  - `apps/provider-sample` -> 演进为 `executor-plan`
  - `apps/frontend` -> 演进为 `chat-surface`
  - `packages/contracts` -> 演进为 `contracts-v0`
- New platform modules:
  - `apps/workflow-platform-api`
  - `apps/workflow-runtime`
  - `apps/control-console`
  - `packages/workflow-contracts`
  - `packages/executor-sdk`
  - `packages/shared-models`
  - `packages/shared-runtime`

### Interfaces & contracts
- API endpoints:
  - Keep: `/v0/ingest`, `/v0/interact`, `/v0/events`, `/v0/stream`, `/v0/timeline`
  - Add: `/v1/workflows`, `/v1/agents`, `/v1/runs`, `/v1/artifacts`, `/v1/approvals`
  - Internal:
    - `/internal/runtime/start-run`
    - `/internal/runtime/resume-run`
    - `/internal/executors/{executorId}/invoke`
- Data models / schemas:
  - `WorkflowTemplate`
  - `WorkflowRun`
  - `WorkflowNodeRun`
  - `Artifact`
  - `ApprovalRequest`
  - 教学场景中的 `AssessmentDraft`, `EvidencePack`, `ReviewableDelivery`
- Events / jobs (if any):
  - timeline projection events
  - runtime continuation jobs
  - approval wait/resume events
  - outbox / retry / replay jobs

### Frozen by child tasks
- `T-012` 已冻结：
  - `workflow-platform-api` 为统一命令/查询入口
  - `workflow-runtime` 持有 run/node 状态推进
  - `ingress-gateway` 负责 `/v0` compatibility projection
  - `worker` 承担 continuation/timer/retry 执行
- `T-018` 已冻结：
  - authoritative vs projection 边界
  - `ActorProfile / ActorMembership / AudienceSelector / DeliverySpec / DeliveryTarget`
  - 平台通用 actor/delivery 外壳与最小枚举
- `T-013` 已冻结：
  - `WorkflowDraft` / `RecipeDraft` 为两个逻辑对象
  - 双入口数据对称、能力与权限不对称
  - draft line publish 后冻结，后续从已发布版本新开 line
- `T-017` 已冻结：
  - 教学仅为首个验证样本，不作为平台基线
  - `AssessmentDraft` 使用 `subject_ref / subject_type`
  - `ReviewableDelivery` 使用 `presentation_ref`
- `T-015` 已冻结：
  - `control-console = React + Vite`
  - 首批页面：`Runboard / Approval Inbox / Draft Inspector / Workflow Studio`
  - `Artifact Explorer` 暂不独立成主区
  - Studio 首期提供轻量 `revision compare`
- `T-014` 已冻结：
  - connector-backed action 与 platform-native action 不共用 catalog
  - 两类 action 共享统一 invoke contract 形状
  - `EventBridge` 先冻结 ownership/handoff，不冻结 `webhook-first` 或 `poll-first`
- `T-016` 已冻结：
  - Convex 只作为后置 projection/read-model 候选
  - 即使后续采用，也不能绕过 `workflow-platform-api` 成为控制台主查询面

### Additional coverage-completion tasks
- `T-019 / ua-agent-lifecycle-and-trigger-design`
  - 补齐 `AgentDefinition`、trigger classes、activation/suspension/retire 边界
- `T-021 / ua-policy-secret-scope-governance-design`
  - 补齐 policy/secret/scope/binding 的正式治理模型
- `T-020 / ua-external-runtime-bridge-design`
  - 补齐外部 agent/runtime 桥接边界
- `T-022 / ua-rnd-collab-validation-scenario-design`
  - 补齐第二验证场景，压测 connector/action/event bridge/governance

### Boundaries & dependency rules
- Allowed dependencies:
  - `apps/*` -> `packages/workflow-contracts`, `packages/executor-sdk`, `packages/shared-*`
  - `apps/control-console` 只通过 control/runtime API 获取数据，不直接读 DB
  - `apps/frontend` 继续依赖 `/v0` 与兼容时间线协议
- Forbidden dependencies:
  - `apps/gateway` 不继续承载 workflow template/approval/policy 主治理逻辑
  - `apps/control-console` 不复用 Expo/RN 组件实现复杂控制面
  - 探索型 agent 不允许绕过 artifact schema 和 review 直接对外交付
  - 新平台层不以 Convex 作为首期 authoritative store

### Implementation tranche dependency map
- `I1 / Platform Foundation`
  - Depends on:
    - `T-012`
    - `T-018`
  - Produces:
    - authoritative objects
    - control/runtime internal command path
    - formal events + projection handoff skeleton
- `I2 / Draft and Publish Path`
  - Depends on:
    - `I1`
    - `T-013`
  - Produces:
    - draft SoT
    - publish path
    - revision lineage
- `I3 / Validation Flow and Control Surface`
  - Depends on:
    - `I2`
    - `T-017`
    - `T-015`
  - Parallel tracks:
    - `I3A`: validation workflow
    - `I3B`: control console
  - Produces:
    - first validation sample
    - Web control surface for draft/run/review
- `I4 / External Integration and Projection Experiments`
  - Depends on:
    - `I1-I3`
    - `T-014`
    - `T-016`
    - `T-021`
    - `T-020`
    - `T-022`
  - Produces:
    - connector/action implementation landing zone
    - optional Convex experiment decision path

### Implementation bundle landing map
- `B1 / ua-platform-foundation-implementation`
  - Primary landing:
    - `apps/workflow-platform-api`
    - `apps/workflow-runtime`
    - `packages/workflow-contracts`
    - `packages/executor-sdk`
    - `prisma/schema.prisma`
    - `apps/gateway`
    - `apps/worker`
  - Reason:
    - 平台骨架与 authoritative objects 需要在同一实施包内一起落地，避免 service skeleton 和 schema 漂移。
- `B2 / ua-builder-draft-publish-implementation`
  - Primary landing:
    - `apps/workflow-platform-api`
    - `packages/workflow-contracts`
    - `apps/gateway`
    - `apps/frontend`
  - Reason:
    - draft SoT 与 publish path 依赖 control-plane API，同时需要 chat intake 接线，但不应提前绑定控制台。
- `B3 / ua-teaching-validation-implementation`
  - Primary landing:
    - `apps/workflow-runtime`
    - `apps/provider-sample`
    - `packages/workflow-contracts`
    - `docs/scenarios/teaching`
  - Reason:
    - 教学验证包是 runtime/executor 验证包，不应反向主导平台对象边界。
- `B4 / ua-control-console-foundation-implementation`
  - Primary landing:
    - `apps/control-console`
    - `packages/workflow-contracts`
    - `packages/shared-ui`（仅在复用真实出现时创建）
  - Reason:
    - 控制面是独立 Web 应用；`shared-ui` 不是预设必建目录，而是按复用需要产生。
- `B5 / ua-agent-governance-implementation`
  - Primary landing:
    - `apps/workflow-platform-api`
    - `apps/trigger-scheduler`
    - `packages/policy-sdk`
    - `packages/workflow-contracts`
  - Reason:
    - agent lifecycle、trigger、policy、secret、scope 是同一治理闭环，实施上不应拆散。
- `B6 / ua-external-runtime-bridge-implementation`
  - Primary landing:
    - `apps/executor-bridge-*`
    - `packages/executor-sdk`
    - `packages/workflow-contracts`
    - `apps/workflow-runtime`
  - Reason:
    - external runtime bridge 属于 executor/capability 体系，不属于 connector registry。
- `B7 / ua-connector-runtime-and-first-capabilities-implementation`
  - Primary landing:
    - `apps/connector-runtime`
    - `apps/connectors/*`
    - `packages/connector-sdk`
    - `packages/workflow-contracts`
  - Reason:
    - connector runtime 和首批 capability 需要同包推进，才能验证 action/event bridge/binding 的完整路径。
- `B8 / ua-rnd-collab-validation-implementation`
  - Primary landing:
    - `docs/scenarios/rnd-collab`
    - `apps/connectors/*`
    - `apps/workflow-runtime`
    - `apps/control-console`
  - Reason:
    - 第二验证场景是能力压测包，不是新的基础设施包；它复用已有 runtime/console/connector 能力。
- `B9 / ua-convex-projection-experiment`
  - Primary landing:
    - `apps/control-console` 的受控 projection adapter
    - `packages/workflow-contracts`
  - Reason:
    - 只在出现真实 read-model 压力时才物理创建；默认保持为条件实验，不预建空目录。

## Data migration (if applicable)
- Migration steps:
  - 继续以 `prisma/schema.prisma` 为数据库 SSOT
  - 新增 workflow/data plane 模型，不覆盖现有 `/v0` 表
  - 保持 timeline 作为投影层；正式对象进入新表
- Backward compatibility strategy:
  - 保留 `/v0` 和 `providerId` 兼容语义
  - `task_question/task_state` 作为 workflow node 兼容投影继续存在
- Rollout plan:
  - 先建立新平台对象与 runtime skeleton
  - 再让 ingress 逐步把复杂编排转发给 runtime
  - 最后再补教学场景与控制台

## Non-functional considerations
- Security/auth/permissions:
  - 创建、发布、激活、绑定权限必须分开
  - 探索型 agent 的外发需要 review gate
  - `Convex` 如果后续引入，只能承接投影，不承接主审计责任
- Performance:
  - chat surface 保持现有 SSE/polling 模式
  - control-console 优先查询一致性与可观测性，而不是 SSR 首屏极致优化
- Observability (logs/metrics/traces):
  - workflow run / node run / approval / artifact 全部需要 traceable identifiers
  - runtime 与 ingress 的关联必须可追踪到 `sessionId`, `runId`, `nodeRunId`

## Open questions
- 当前无阻止 implementation tranche 启动的高影响架构问题。
- 剩余问题主要是实施编排层面的：
  - `B1-B9` 的 owner 分配与并行节奏
  - `apps/trigger-scheduler`、`packages/policy-sdk`、`packages/connector-sdk` 是否在对应 bundle 首轮就物理创建，还是先内聚在现有模块中再抽离
- 若以“完整覆盖设计记录 v0.2 主体需求”为标准，当前规划层已完成覆盖；剩余事项不再是主体能力缺口，而是字段级细化与 implementation sequencing。
