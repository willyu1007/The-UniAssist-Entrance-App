# 01 Plan

## Phases
1. P0 规划与边界冻结
2. P1 平台骨架与正式对象落地
3. P2 教学场景验证与探索型 agent 收敛
4. P3 控制台与治理视图
5. P4 外部 runtime / connector 前置能力

## Detailed steps
- 创建任务总包并沉淀 `roadmap.md`、`00-05` 结构：
  - 记录升级目标、非目标、阶段顺序、关键约束
  - 将教学场景和 agent 收敛纳入首批验收
- 在 P0 冻结关键边界：
  - `control-console` 独立 Web 应用
  - Postgres + Prisma 继续作为主数据面
  - `Convex` 仅保留为后续可选投影层
  - `/v0` 兼容层不首期废弃
- 在 P1 定义平台骨架：
  - 新增 `workflow-platform-api`
  - 新增 `workflow-runtime`
  - 新增 `workflow-contracts` 与 `executor-sdk`
  - 增补 Prisma 中的 workflow/data plane 正式对象
- 在 P2 聚焦教学场景：
  - 定义首条 workflow
  - 定义探索型评估 agent 的收敛合同
  - 定义 `AssessmentDraft`, `EvidencePack`, `ReviewableDelivery`
- 在 P3 规划控制台：
  - 明确 `Workflow Studio / Runboard / Approval Inbox / Artifact Explorer`
  - 锁定 Web 技术栈和数据获取策略
- 在 P4 准备后续扩展：
  - 输出 connector/action layer 设计稿
  - 明确 external runtime bridge 边界

## Current freeze summary
- 已冻结的设计子包：
  - `T-012 / ua-workflow-core-skeleton-design`
  - `T-018 / ua-workflow-data-plane-design`
  - `T-013 / ua-builder-draft-sot-design`
  - `T-017 / ua-teaching-assessment-scenario-design`
  - `T-015 / ua-control-console-foundation-design`
  - `T-014 / ua-connector-action-layer-design`
  - `T-016 / ua-convex-projection-evaluation`
- 所有 P0 设计子包的高影响边界已冻结；当前不再存在阻止 implementation tranche 编排的架构级空白。
- 为补齐设计记录 v0.2 的主体覆盖，新增了 4 个补充设计子包：
  - `T-019 / ua-agent-lifecycle-and-trigger-design`
  - `T-021 / ua-policy-secret-scope-governance-design`
  - `T-020 / ua-external-runtime-bridge-design`
  - `T-022 / ua-rnd-collab-validation-scenario-design`
- 当前总包判断：
  - `P0` 规划冻结已完成
  - 下一步重点是把已冻结设计结论拆成可执行的 implementation tranche，而不是继续扩展设计范围
  - 经过总包级同步审计，当前规划层已完整覆盖 v0.2 主体需求；后续剩余工作属于字段级收敛和 implementation 编排，而不是主体覆盖补洞
  - implementation 开包单位固定为 `8` 个主实施包 + `1` 个条件实验包，而不是简单按设计子包数量逐一开实现任务

## Coverage-completion design packages

### C1. Agent Lifecycle and Trigger
- Scope:
  - `T-019 / ua-agent-lifecycle-and-trigger-design`
- Purpose:
  - 冻结 `AgentDefinition / trigger / activation` 的主体设计边界
- Dependency:
  - 依赖 `T-012` 与 `T-013`
- Blocking rule:
  - 已不再阻塞“规划层完整覆盖 v0.2”声明
  - 继续作为 `B5 / ua-agent-governance-implementation` 的前置设计包

### C2. Policy Secret Scope Governance
- Scope:
  - `T-021 / ua-policy-secret-scope-governance-design`
- Purpose:
  - 冻结 policy/secret/scope/binding 的正式治理模型
- Dependency:
  - 依赖 `T-013`、`T-014`，并与 `C1` 强相关
- Blocking rule:
  - 不阻塞 `B1-B4`
  - 作为 `B5 / ua-agent-governance-implementation` 与 `B7 / connector runtime` 的治理前置

### C3. External Runtime Bridge
- Scope:
  - `T-020 / ua-external-runtime-bridge-design`
- Purpose:
  - 冻结外部 agent/runtime 接入边界
- Dependency:
  - 依赖 `T-012`、`T-014`，并与 `C1/C2` 相关
- Blocking rule:
  - 不阻塞 `B1-B5`
  - 作为 `B6 / external runtime bridge` 的前置设计包

### C4. R&D Collaboration Validation Scenario
- Scope:
  - `T-022 / ua-rnd-collab-validation-scenario-design`
- Purpose:
  - 冻结第二验证场景，避免实现阶段再临时拼场景
- Dependency:
  - 依赖 `T-014`，并需要 `C2/C3` 提供治理与桥接基线
- Blocking rule:
  - 不阻塞 `B1-B7`
  - 作为 `B8 / R&D collaboration validation` 的前置设计包

## Implementation tranche order

### I1. Platform Foundation
- Scope:
  - `T-012 / ua-workflow-core-skeleton-design`
  - `T-018 / ua-workflow-data-plane-design`
- Deliverables:
  - `workflow-platform-api` / `workflow-runtime` / `workflow-contracts` / `executor-sdk` 最小骨架
  - authoritative workflow/data plane 首批模型与迁移
  - internal HTTP command path
  - formal events + outbox/worker continuation skeleton
  - `/v0` compatibility handoff 的 feature-gated 接线
- Admission criteria:
  - `T-012` 与 `T-018` 无高影响开放问题
  - authoritative vs projection 边界已冻结
  - `/v0` compatibility 保留策略已明确
- Exit criteria:
  - 能创建 template/version
  - 能启动 run 并持久化 node/artifact/approval 主对象
  - `/v0` 入口与 timeline 不回归

### I2. Draft and Publish Path
- Scope:
  - `T-013 / ua-builder-draft-sot-design`
  - `I1` 暴露的 control-plane API 面补齐
- Deliverables:
  - `WorkflowDraft` / `RecipeDraft`
  - `DraftRevision` append-only revision log
  - publish -> `WorkflowTemplateVersion`
  - chat intake -> draft 的统一 SoT 接线
- Admission criteria:
  - `I1` 的 template/version/run 对象和 API 已稳定
  - `T-013` 的 draft line、publish、lineage 规则已冻结
- Exit criteria:
  - chat surface 与 control console 共用同一 draft SoT
  - publish 不会回写已发布 draft line
  - recipe candidate 形成路径可落到 control plane

### I3. Validation Flow and Control Surface
- Scope:
  - `T-017 / ua-teaching-assessment-scenario-design`
  - `T-015 / ua-control-console-foundation-design`
- Execution rule:
  - `I3A` 教学验证链路与 `I3B` 控制台基础可以并行
  - 但两者都必须在 `I2` 稳定后启动
- Deliverables:
  - 首条验证 workflow：`上传 -> 解析接口 -> agent -> review -> delivery`
  - `Runboard / Approval Inbox / Draft Inspector / Workflow Studio`
  - control-console 对 draft/run/artifact/approval 的最小可观测和治理动作
- Admission criteria:
  - `I2` 的 draft/publish/query 面已稳定
  - `T-017` 与 `T-015` 的高影响边界已冻结
- Exit criteria:
  - 验证 workflow 全链路可跑通
  - 外发前 review gate 生效
  - Web 控制台可 inspect/review/publish，不需要直连 DB

### I4. External Integration and Projection Experiments
- Scope:
  - `T-014 / ua-connector-action-layer-design`
  - `T-016 / ua-convex-projection-evaluation`
- Deliverables:
  - connector/action registry 与 binding/policy/invoke path
  - 如有必要，新开独立 Convex experiment task
- Admission criteria:
  - `I1-I3` 已提供稳定的 authoritative objects、invoke path、read model 边界
  - 不再需要依赖 connector/Convex 来证明平台主线成立
  - `T-021 / T-020 / T-022` 至少已达到 handoff-ready，避免 I4 反向定义治理、bridge 和第二验证场景
- Exit criteria:
  - connector 不与 executor/workflow 混义
  - Convex 是否采用有明确 `go / no-go`
  - 即使 `go`，也不破坏 `workflow-platform-api` 作为控制台统一入口

## Implementation bundle layout

### B1. `ua-platform-foundation-implementation`
- Tranche:
  - `I1 / Platform Foundation`
- Maps to:
  - `T-012`
  - `T-018`
- Scope:
  - `workflow-platform-api`
  - `workflow-runtime`
  - `workflow-contracts`
  - `executor-sdk`
  - authoritative workflow/data plane schema
  - `gateway/worker` 的 compatibility handoff
- Repo landing:
  - `apps/workflow-platform-api`
  - `apps/workflow-runtime`
  - `packages/workflow-contracts`
  - `packages/executor-sdk`
  - `prisma/schema.prisma`
  - `apps/gateway`
  - `apps/worker`

### B2. `ua-builder-draft-publish-implementation`
- Tranche:
  - `I2 / Draft and Publish Path`
- Maps to:
  - `T-013`
- Scope:
  - `WorkflowDraft`
  - `DraftRevision`
  - `RecipeDraft`
  - publish path
  - chat intake -> control-plane draft SoT 接线
- Repo landing:
  - `apps/workflow-platform-api`
  - `packages/workflow-contracts`
  - `apps/gateway`
  - `apps/frontend`（仅限 chat intake 接线）

### B3. `ua-teaching-validation-implementation`
- Tranche:
  - `I3 / Validation Flow and Control Surface`
- Maps to:
  - `T-017`
- Scope:
  - 首条验证 workflow
  - `AssessmentDraft`
  - `EvidencePack`
  - `ReviewableDelivery`
  - `AnalysisRecipe` candidate capture
- Repo landing:
  - `apps/workflow-runtime`
  - `apps/provider-sample`（兼容 executor 样例演进）
  - `packages/workflow-contracts`
  - `docs/scenarios/teaching`

### B4. `ua-control-console-foundation-implementation`
- Tranche:
  - `I3 / Validation Flow and Control Surface`
- Maps to:
  - `T-015`
- Scope:
  - `Runboard`
  - `Approval Inbox`
  - `Draft Inspector`
  - `Workflow Studio`
- Repo landing:
  - `apps/control-console`
  - `packages/shared-ui`（仅在 Web 控制台共享抽象真实出现时创建）
  - `packages/workflow-contracts`

### B5. `ua-agent-governance-implementation`
- Tranche:
  - `I3` 之后，`I4` 之前的治理闭环实施
- Maps to:
  - `T-019`
  - `T-021`
- Scope:
  - `AgentDefinition`
  - trigger ownership
  - activation/suspension/retire
  - `PolicyBinding`
  - `SecretRef`
  - `ScopeGrant`
  - 高风险动作治理
- Repo landing:
  - `apps/workflow-platform-api`
  - `apps/trigger-scheduler`（若首版需要独立 deployable）
  - `packages/policy-sdk`
  - `packages/workflow-contracts`

### B6. `ua-external-runtime-bridge-implementation`
- Tranche:
  - `I4 / External Integration and Projection Experiments`
- Maps to:
  - `T-020`
- Scope:
  - external runtime bridge registration
  - `invoke / resume / cancel`
  - `checkpoint / result / error / approval_requested`
- Repo landing:
  - `apps/executor-bridge-*`
  - `packages/executor-sdk`
  - `packages/workflow-contracts`
  - `apps/workflow-runtime`

### B7. `ua-connector-runtime-and-first-capabilities-implementation`
- Tranche:
  - `I4 / External Integration and Projection Experiments`
- Maps to:
  - `T-014`
- Scope:
  - connector runtime
  - connector/action registry
  - event bridge
  - browser fallback guardrails
  - 支撑第二验证场景的首批 capability
- Repo landing:
  - `apps/connector-runtime`
  - `apps/connectors/*`
  - `packages/connector-sdk`
  - `packages/workflow-contracts`

### B8. `ua-rnd-collab-validation-implementation`
- Tranche:
  - `I4 / External Integration and Projection Experiments`
- Maps to:
  - `T-022`
- Scope:
  - 变更/发布协作验证链路
  - `issue_tracker + source_control + ci_pipeline`
  - 至少一个受治理外部写操作
  - 至少一个异步 callback
- Repo landing:
  - `docs/scenarios/rnd-collab`
  - `apps/connectors/*`
  - `apps/workflow-runtime`
  - `apps/control-console`

### B9. `ua-convex-projection-experiment`
- Tranche:
  - `I4 / External Integration and Projection Experiments`
- Maps to:
  - `T-016`
- Scope:
  - 只评估 Convex 作为 projection/read-model 层的可行性
  - 产出 `go / no-go` 与退出条件
- Repo landing:
  - `apps/control-console` 的受控 subscription adapter
  - `packages/workflow-contracts`
  - 必要时新增独立 projection experiment 目录
- Special rule:
  - 条件实验包，不阻塞 `B1-B8`
  - 未出现明确实时 read-model 压力前，不创建物理模块

## Implementation bundle order
1. `B1 / ua-platform-foundation-implementation`
2. `B2 / ua-builder-draft-publish-implementation`
3. `B3 / ua-teaching-validation-implementation`
4. `B4 / ua-control-console-foundation-implementation`
5. `B5 / ua-agent-governance-implementation`
6. `B6 / ua-external-runtime-bridge-implementation`
7. `B7 / ua-connector-runtime-and-first-capabilities-implementation`
8. `B8 / ua-rnd-collab-validation-implementation`
9. `B9 / ua-convex-projection-experiment`

## Bundle planning rules
- 不按设计子包数量机械地一包对应一包；implementation bundle 以可落地的 repo 变更单元和依赖闭环为准。
- `T-012 + T-018` 合并为 `B1`，因为平台骨架与 authoritative data plane 在实现上强耦合。
- `T-019 + T-021` 合并为 `B5`，因为 agent lifecycle、trigger、secret、scope、approval 构成同一治理闭环。
- `T-020` 不能并入 `B7`，否则 external runtime bridge 会与 connector/action layer 重新混义。
- `T-022` 不能并入 `B7`，因为它是验证场景实施包，不是基础设施实施包。
- `T-016` 只能作为条件实验包，不能提升为主线阻塞项。

## Risks & mitigations
- Risk:
  - 规划总包只停留在抽象语言，不能指导实施
  - Mitigation:
    - 强制每个阶段都写明 deliverable、verification、rollback
- Risk:
  - 教学场景只验证 deterministic workflow，没有验证探索型 agent 收敛
  - Mitigation:
    - 将 agent 收敛合同写入 Phase 2 definition of done
- Risk:
  - 控制台技术栈讨论无限发散
  - Mitigation:
    - 先锁定“独立 Web + 明确 API 后端边界”，再在 Vite/Next 之间做一轮定案
- Risk:
  - 在 `I1/I2` 未完成前过早实现控制台或 connector，导致底层对象与 API 反复返工
  - Mitigation:
    - 强制所有 implementation task 先满足 tranche admission criteria，再允许开包
- Risk:
  - Convex 讨论或 connector 实验抢走主线
  - Mitigation:
    - 将 `I4` 明确后置到 `I1-I3` 之后，并禁止其成为平台主线的阻塞项
