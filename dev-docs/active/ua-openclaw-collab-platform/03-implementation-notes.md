# 03 Implementation Notes

## Current state
- 本任务处于规划阶段，尚未开始产品代码改造。
- 当前文档用于固定升级节奏与后续实施顺序，不用于记录代码层实施细节。
- 当前已进入“设计闭环完成 + implementation tranche 编排”阶段，不再停留在纯路线讨论。

## Initial decisions
- 新任务 slug 固定为 `ua-openclaw-collab-platform`。
- 项目治理已为该任务分配 `T-011`。
- 本任务是项目级升级总包，不复用 `uniassist-entrance-engine-v0`。
- 教学场景作为首个验证场景，且必须覆盖探索型个性化评估 agent 的收敛过程。
- `control-console` 按独立 Web 应用方向规划。
- Postgres + Prisma 继续作为主数据面；Convex 如后续采用，仅作为可选投影层。
- 已启动首个设计子包：`T-012 / ua-workflow-core-skeleton-design`。
- 已创建后续设计子包：
  - `T-018 / ua-workflow-data-plane-design`
  - `T-013 / ua-builder-draft-sot-design`
  - `T-017 / ua-teaching-assessment-scenario-design`
  - `T-015 / ua-control-console-foundation-design`
  - `T-014 / ua-connector-action-layer-design`
  - `T-016 / ua-convex-projection-evaluation`
- 为补齐 v0.2 主体覆盖，新增 4 个补充设计子包：
  - `T-019 / ua-agent-lifecycle-and-trigger-design`
  - `T-021 / ua-policy-secret-scope-governance-design`
  - `T-020 / ua-external-runtime-bridge-design`
  - `T-022 / ua-rnd-collab-validation-scenario-design`
- 推进顺序已冻结为：`T-018 -> T-013 -> T-017 -> T-015 -> T-014 -> T-016`。
- 补充设计子包的推进顺序已冻结为：`T-019 -> T-021 -> T-020 -> T-022`。
- 任务 ID 由治理按字母顺序分配，不代表执行顺序。
- implementation tranche 顺序已冻结为：`I1 Platform Foundation -> I2 Draft and Publish Path -> I3 Validation Flow and Control Surface -> I4 External Integration and Projection Experiments`。
- implementation bundle 结构已冻结为：`8` 个主实施包 + `1` 个条件实验包。
- bundle 顺序已冻结为：`B1 Platform Foundation -> B2 Builder Draft Publish -> B3 Teaching Validation -> B4 Control Console Foundation -> B5 Agent Governance -> B6 External Runtime Bridge -> B7 Connector Runtime and First Capabilities -> B8 R&D Collaboration Validation -> B9 Convex Projection Experiment`。

## Planned decision log
- Resolved through child tasks:
  - `control-console = React + Vite`，并固定 Web-first 管理台边界（`T-015`）
  - 教学首条 workflow 仅作为首个验证样本，不反向定义平台基线（`T-017`）
  - `workflow-platform-api -> workflow-runtime` 的首期命令边界与 `/v0` 兼容接线（`T-012`）
  - Postgres/Prisma 作为 authoritative store；Convex 仅保留为后续 projection 评估方向（`T-018` + `T-016`）
  - connector/action layer 不与 executor/workflow/catalog 混义（`T-014`）
  - implementation tranche 的开包顺序与 admission criteria 已冻结
  - implementation 以可落地 repo 变更单元为准，不按设计子包数量机械开包
  - `T-012 + T-018` 合并为 `B1`
  - `T-019 + T-021` 合并为 `B5`
  - `T-020` 与 `T-014` 分离，避免 external runtime bridge 与 connector 混义
  - `T-022` 作为独立验证实施包存在，不并入 connector 基础设施包
  - `T-016` 保持条件实验包地位，不阻塞主线
- Still pending:
  - 为 `B1-B9` 实际开 implementation task bundle
  - 确定 `B1-B9` 的实施 owner 与是否允许局部并行
  - 在 implementation 启动前补齐每个 bundle 的 verification checklist 与 rollback notes

## Audit conclusion
- 2026-03-11 总包级同步审计确认：
  - 规划层已完整覆盖设计记录 v0.2 的主体需求
  - `T-021` 中重复审批账本的语义冲突已被消除，统一复用 `ApprovalRequest / ApprovalDecision`
  - `T-012 / T-018` 的状态漂移已修正，不再与总包“已冻结基线”的表述冲突
  - 当前未发现阻止 implementation tranche 启动的高影响逻辑冲突；剩余问题主要是字段级 DTO、schema 和 owner 分配
  - implementation 编排层已从 `I1-I4` tranche 进一步收敛为 `8+1` bundle 结构，并补齐 repo landing map

## Deviation tracking
- 当前无偏离 roadmap 的事项。

## Follow-up TODOs
- 保持 `T-011` 与 `T-012 / T-018 / T-013 / T-017 / T-015 / T-014 / T-016` 的冻结结论一致
- 保持 `T-019 / T-021 / T-020 / T-022` 的冻结结论与 `B5-B8` 映射保持一致
- 优先为 `B1 / ua-platform-foundation-implementation` 开 implementation bundle
- 在 `B1` admission criteria 满足后，再为 `B2 / ua-builder-draft-publish-implementation` 开 implementation bundle
- 仅在 `B2` 稳定后，才并行启动 `B3 / ua-teaching-validation-implementation` 与 `B4 / ua-control-console-foundation-implementation`
- 在 `B3/B4` 稳定后，再进入 `B5 / ua-agent-governance-implementation`
- 将 `B9 / ua-convex-projection-experiment` 明确维持为条件实验包，不作为主线 implementation 的阻塞项
