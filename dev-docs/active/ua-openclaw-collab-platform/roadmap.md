# UniAssist Collaborative Workflow Platform Upgrade — Roadmap

## Goal
- 在保留当前 `/v0` 统一入口兼容层的前提下，将仓库分阶段升级为面向团队协作、自定义 workflow、可承载探索型 agent 收敛过程的主平台 monorepo。

## Planning-mode context and merge policy
- Runtime mode signal: Default
- User confirmation when signal is unknown: not-needed
- Host plan artifact path(s): (none)
- Requirements baseline: `/Users/phoenix/Downloads/team-openclaw-collab-workflow-design-record-v0.2.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > requirement.md > host plan artifact > model inference
- Repository SSOT output: `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
- Mode fallback used: non-Plan default applied: yes

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| User-confirmed instructions | Current chat request | 升级目标、节奏诉求、教学场景优先级、控制台方向、Convex 取舍 | highest | 明确要求先开任务总包并确定升级节奏 |
| Requirements doc | `/Users/phoenix/Downloads/team-openclaw-collab-workflow-design-record-v0.2.md` | 目标对象模型、分层、目录树、迁移阶段、场景验证基线 | high | 作为本轮规划的上位设计记录 |
| Repository state | `README.md`, `apps/gateway/src/server.ts`, `apps/gateway/src/persistence.ts`, `packages/contracts/src/types.ts`, `prisma/schema.prisma` | 当前系统中心、兼容边界、数据层现状 | high | 说明当前仍是 ingress-centric system |
| Existing roadmap | (none) | (none) | medium | 本任务是新规划任务，不复用现有 roadmap |
| Model inference | N/A | 填补阶段切分、文档组织、风险拆分 | lowest | 不覆盖用户已确认决策 |

## Non-goals
- 不在第一阶段直接废弃当前 `/v0`、`providerId`、`task_question/task_state` 兼容协议
- 不在对象模型未冻结前直接将主数据面替换为 Convex
- 不在 P0/P1 先做画布式 workflow builder UI
- 不在首期同时接入 GitHub/Jira/CI 等 connector 生态
- 不让探索型 agent 直接输出未经 schema 化和审核的外部结果

## Resolved planning decisions
- `apps/control-console` 首期技术栈固定为 `React + Vite + TypeScript`。
- 首个验证样本采用教学场景，但它只用于验证平台原语，不反向定义平台默认基线。
- `workflow-platform-api -> workflow-runtime` 的长期边界采用 `Hybrid` 目标，首期先走 internal HTTP command path。
- Postgres + Prisma 继续作为 authoritative store；Convex 仅保留为后置 projection/read-model 候选。
- connector/action layer 为后置能力，不允许打断 `I1-I3` 主线。
- implementation 采用 `I1-I4` tranche + `8` 个主实施包 + `1` 个条件实验包的双层编排，而不是按设计子包数量逐一落实现任务。

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | “升级成全面 monorepo”的含义 | 用户表述偏仓库形态 vs repo 已经是 monorepo | 将核心目标收敛为“系统中心迁移 + 平台分层补齐” | 以 repo 现状与用户确认后的目标为准 | 在 Phase 1 固化目录和命名策略 |
| C2 | 首个验证场景 | 教学场景 vs 研发/connector 场景 | 先教学场景，再外部 connector 场景 | 用户明确要求教学场景先行 | 在 Phase 2/3 设计首条 workflow |
| C3 | 探索型 agent 的定位 | 纯 deterministic workflow vs 放开 agent 自治 | 采用“确定性 workflow 外层 + 受控 agentic node 内层” | 设计记录与用户新约束一致 | 在 Phase 1 定义收敛合同 |
| C4 | 控制台形态 | 继续复用 Expo/RN vs 独立 Web 控制台 | 首期按独立 Web 控制台规划 | 用户明确认为控制台操作复杂 | 技术栈在 Phase 0 冻结 |
| C5 | Convex 的角色 | 作为主数据库 vs 可选投影层 | 暂不作为主数据面，仅保留候选投影层位置 | 当前 repo 已有 Prisma/Postgres SSOT，且用户同意先定节奏 | 后续单独评估是否纳入 Phase 4 以后 |

## Scope and impact
- Affected areas/modules:
  - `apps/gateway`（收敛为 ingress-gateway 职责）
  - `apps/provider-plan`（改义为 executor-plan 兼容样例）
  - `apps/frontend`（明确为 chat surface）
  - `apps/worker`（向 runtime/background jobs 扩展）
  - `packages/contracts`（改义为 `/v0` 合同层）
  - `prisma/schema.prisma`（新增 workflow/data plane 正式对象）
  - `dev-docs/`, `.ai/project/main/`（规划与治理）
- External interfaces/APIs:
  - 继续保留 `/v0/*`
  - 新增 `/v1/workflows`, `/v1/agents`, `/v1/runs`, `/v1/artifacts`, `/v1/approvals`
  - 新增内部 runtime/executor 接口
- Data/storage impact:
  - 新增 `workflow_template`, `workflow_template_version`, `workflow_run`, `workflow_node_run`, `artifact`, `approval_request` 等对象
  - timeline 降级为体验投影，正式对象迁移到 Data Plane
  - 保留 Redis outbox/stream/retry 语义
- Backward compatibility:
  - `/v0` 与 chat surface 在过渡期继续可用
  - `providerId` 继续保留 northbound 兼容意义

## Consistency baseline for dual artifacts (if applicable)
- [x] Goal is semantically aligned with the design record
- [x] Boundaries/non-goals are aligned
- [x] Constraints are aligned
- [x] Milestones/phases ordering is aligned
- [x] Acceptance criteria are aligned
- Intentional divergences:
  - 将“探索型 agent 的收敛链路”明确提升为教学场景的首期验收目标
  - 将 Convex 明确限制为“非主数据面”的后续候选项

## Project structure change preview (may be empty)
This section is a **non-binding, early hypothesis** to help humans confirm expected project-structure impact.

### Existing areas likely to change (may be empty)
- Modify:
  - `apps/gateway/`
  - `apps/provider-plan/`
  - `apps/frontend/`
  - `apps/worker/`
  - `packages/contracts/`
  - `prisma/`
  - `docs/context/`
  - `dev-docs/`
- Delete:
  - (none)
- Move/Rename:
  - `apps/frontend/` -> `apps/chat-surface/`（时机待定）
  - `apps/gateway/` -> `apps/ingress-gateway/`（时机待定）
  - `apps/provider-plan/` -> `apps/executor-plan/`（时机待定）
  - `packages/contracts/` -> `packages/contracts-v0/`（时机待定）

### New additions (landing points) (may be empty)
- New module(s) (preferred):
  - `apps/workflow-platform-api/`
  - `apps/workflow-runtime/`
  - `apps/control-console/`
  - `packages/workflow-contracts/`
  - `packages/executor-sdk/`
  - `packages/shared-models/`
  - `packages/shared-runtime/`
- New interface(s)/API(s) (when relevant):
  - `/v1/workflows`
  - `/v1/agents`
  - `/v1/runs`
  - `/v1/artifacts`
  - `/v1/approvals`
- New file(s) (optional):
  - `prisma/schema.prisma` new models
  - `docs/scenarios/teaching/*.md`

## Phases
1. **Phase 1**: P0 规划与边界冻结
   - Deliverable: 升级节奏、命名、控制台形态、数据面策略、教学场景验证路径全部冻结
   - Acceptance criteria: 总包文档可作为后续多轮讨论与 implementation tranche 编排的唯一规划基线
2. **Phase 2**: P1 平台骨架与正式对象落地
   - Deliverable: `workflow-platform-api + workflow-runtime + workflow-contracts + executor-sdk` 最小骨架与首批 DB 对象
   - Acceptance criteria: 不改 `/v0` 入口即可创建和追踪 workflow run
3. **Phase 3**: P2 教学场景验证与探索型 agent 收敛
   - Deliverable: 教学首条 workflow 跑通，并验证 `agentic_node -> assessment draft -> review -> delivery`
   - Acceptance criteria: 探索型 agent 输出不依赖聊天文本，可被结构化审核与复用
4. **Phase 4**: P3 控制台与治理视图
   - Deliverable: `control-console` 可查看 workflow、run、approval、artifact，并支持基础治理动作
   - Acceptance criteria: 关键对象可从 Web 控制台操作和观测
5. **Phase 5**: P4 外部 runtime / connector 前置能力
   - Deliverable: 明确 connector/action layer 的接入边界与是否引入 Convex 投影层
   - Acceptance criteria: 后续研发场景与 connector 扩展已有稳定落点

## Implementation tranches
1. **I1 / Platform Foundation**
   - Maps to: `T-012 + T-018`
   - Scope: platform API/runtime skeleton、authoritative objects、formal events/outbox/worker handoff、`/v0` compatibility handoff
   - Admission criteria: core/data plane design packages have no high-impact open issues
2. **I2 / Draft and Publish Path**
   - Maps to: `T-013`
   - Scope: draft SoT、publish path、revision lineage、chat intake -> draft integration
   - Admission criteria: `I1` objects and API contracts are stable
3. **I3 / Validation Flow and Control Surface**
   - Maps to: `T-017 + T-015`
   - Scope: first validation sample + control console foundation
   - Execution rule: `I3A` and `I3B` can run in parallel, but only after `I2`
4. **I4 / External Integration and Projection Experiments**
   - Maps to: `T-014 + T-016`
   - Scope: connector/action implementation landing zone + optional Convex experiment task
   - Admission criteria: `I1-I3` already prove the platform mainline without connector/Convex dependence; governance/runtime-bridge/second-validation design gaps are already taskized and at least handoff-ready

## Implementation bundles
1. **B1 / Platform Foundation Implementation**
   - Maps to: `T-012 + T-018`
   - Scope: `workflow-platform-api`, `workflow-runtime`, authoritative schema, formal events/outbox/worker handoff, `/v0` compatibility handoff
   - Repo landing: `apps/workflow-platform-api`, `apps/workflow-runtime`, `packages/workflow-contracts`, `packages/executor-sdk`, `prisma/schema.prisma`, `apps/gateway`, `apps/worker`
2. **B2 / Builder Draft Publish Implementation**
   - Maps to: `T-013`
   - Scope: `WorkflowDraft`, `DraftRevision`, `RecipeDraft`, publish path, chat intake -> control-plane draft SoT
   - Repo landing: `apps/workflow-platform-api`, `packages/workflow-contracts`, `apps/gateway`, `apps/frontend`
3. **B3 / Teaching Validation Implementation**
   - Maps to: `T-017`
   - Scope: 首条验证 workflow、`AssessmentDraft`、`EvidencePack`、`ReviewableDelivery`、recipe candidate capture
   - Repo landing: `apps/workflow-runtime`, `apps/provider-plan`, `packages/workflow-contracts`, `docs/scenarios/teaching`
4. **B4 / Control Console Foundation Implementation**
   - Maps to: `T-015`
   - Scope: `Runboard`, `Approval Inbox`, `Draft Inspector`, `Workflow Studio`
   - Repo landing: `apps/control-console`, `packages/workflow-contracts`, `packages/shared-ui`（仅在确有共享抽象时创建）
5. **B5 / Agent Governance Implementation**
   - Maps to: `T-019 + T-021`
   - Scope: `AgentDefinition`, trigger ownership, activation lifecycle, `PolicyBinding`, `SecretRef`, `ScopeGrant`, privileged action governance
   - Repo landing: `apps/workflow-platform-api`, `apps/trigger-scheduler`, `packages/policy-sdk`, `packages/workflow-contracts`
6. **B6 / External Runtime Bridge Implementation**
   - Maps to: `T-020`
   - Scope: bridge registration, `invoke/resume/cancel`, `checkpoint/result/error/approval_requested`
   - Repo landing: `apps/executor-bridge-*`, `packages/executor-sdk`, `packages/workflow-contracts`, `apps/workflow-runtime`
7. **B7 / Connector Runtime and First Capabilities Implementation**
   - Maps to: `T-014`
   - Scope: connector runtime, action registry, event bridge, browser fallback guardrails, first capabilities for the second validation chain
   - Repo landing: `apps/connector-runtime`, `apps/connectors/*`, `packages/connector-sdk`, `packages/workflow-contracts`
8. **B8 / R&D Collaboration Validation Implementation**
   - Maps to: `T-022`
   - Scope: 变更/发布协作验证链路，`issue_tracker + source_control + ci_pipeline`，受治理写操作与异步 callback
   - Repo landing: `docs/scenarios/rnd-collab`, `apps/connectors/*`, `apps/workflow-runtime`, `apps/control-console`
9. **B9 / Convex Projection Experiment**
   - Maps to: `T-016`
   - Scope: 可选 projection/read-model 实验，输出 `go / no-go`
   - Repo landing: 仅在压力成立时才新增受控 projection adapter；默认不创建物理模块

## Additional coverage-completion design tasks
1. `ua-agent-lifecycle-and-trigger-design`
   - Covers: `AgentDefinition`, activation lifecycle, trigger ownership
2. `ua-policy-secret-scope-governance-design`
   - Covers: policy binding, secret refs, scope grants, privileged action governance
3. `ua-external-runtime-bridge-design`
   - Covers: external agent/runtime bridge, invoke/checkpoint/callback handoff
4. `ua-rnd-collab-validation-scenario-design`
   - Covers: second validation scenario for engineering collaboration, connector/action/event bridge feedback loop

These four tasks are now part of the frozen planning baseline. They do not block `I1-I3`, they no longer block the claim that planning fully covers the v0.2 design-record surface, and they remain the required design inputs for `B5-B8`.

## Step-by-step plan (phased)
> Keep each step small, verifiable, and reversible.

### Phase 0 — Discovery
- Objective: 把已有讨论沉淀成单一任务基线，避免后续在抽象层重复对齐。
- Deliverables:
  - 本任务总包与 roadmap
  - 升级阶段切分草案
  - 教学场景首条 workflow 候选路径
- Verification:
  - 文档能够回答“为什么做、先做什么、后做什么、什么暂时不做”
- Rollback:
  - N/A (planning-only)

### Phase 1 — P0 规划与边界冻结
- Objective: 冻结关键边界，避免一开始就在技术栈和对象命名上漂移。
- Deliverables:
  - 命名与目录演进策略
  - `control-console` 技术栈结论
  - `Convex` 角色结论
  - 教学场景的收敛合同草案
- Verification:
  - 用户确认关键边界
  - 文档中不再存在互相冲突的阶段目标
- Rollback:
  - 若未冻结，维持“只讨论不实施”，不进入代码改造

### Phase 2 — P1 平台骨架与正式对象落地
- Objective: 补足 control plane、runtime 和 data plane 的最小骨架。
- Deliverables:
  - `apps/workflow-platform-api`
  - `apps/workflow-runtime`
  - `packages/workflow-contracts`
  - `packages/executor-sdk`
  - Prisma 首批 workflow/data plane 模型
- Verification:
  - 可创建 workflow template/version
  - 可启动 workflow run 并持久化 node state
  - `/v0` 兼容入口仍可工作
- Rollback:
  - 入口继续走现有 provider path，runtime skeleton 暂不接管线上主链路

### Phase 3 — P2 教学场景验证与探索型 agent 收敛
- Objective: 用教学场景验证平台横向能力和 agent 收敛机制。
- Deliverables:
  - 材料 ingestion/parse 流程
  - 个性化评估 agentic node
  - `AssessmentDraft`, `EvidencePack`, `ReviewableDelivery` 等结构化对象
  - 教师审核与家长/学生多视图交付
- Verification:
  - agent 的探索输出必须进入 schema 化 artifact
  - 审核前不能直接外发
  - 交付视图能区分教师内部与家长/学生外部对象
- Rollback:
  - 先关闭 agentic node，退回 deterministic draft pipeline

### Phase 4 — P3 控制台与治理视图
- Objective: 给 workflow 平台补上真正可用的控制面。
- Deliverables:
  - `Workflow Studio`
  - `Runboard`
  - `Approval Inbox`
  - 嵌入式 `Artifact Explorer`
  - 基础 registry / policy 视图
- Verification:
  - Web 控制台可查看 run、审批、artifact
  - 基础 pause/resume/review 动作可执行
- Rollback:
  - 继续依赖 chat surface + DB/admin tools 做过渡运维

### Phase 5 — P4 外部 runtime / connector 前置能力
- Objective: 为后续研发场景和 connector/action layer 留出稳定落点。
- Deliverables:
  - connector/action layer 设计稿
  - external runtime bridge 边界草案
  - Convex projection 评估结论（若保留）
- Verification:
  - 设计不破坏已落地的 workflow/data plane 主链路
  - connector 不与 executor/workflow 语义混淆
- Rollback:
  - 不推进 connector 实施，仅保留设计接口

## Verification and acceptance criteria
- Build/typecheck:
  - 规划阶段暂不新增代码构建要求
  - 文档创建后应能通过项目治理同步
- Automated tests:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Manual checks:
  - 任务总包文件完整存在
  - 规划能明确回答“节奏、边界、首个验证场景、控制台方向、数据面方向”
  - 后续讨论可直接引用该总包继续推进
- Acceptance criteria:
  - 形成一个独立的新任务，而不是继续混入 `uniassist-entrance-engine-v0`
  - 形成可执行的阶段顺序，而不是只给出抽象架构图
  - 明确教学场景与探索型 agent 的首期位置
  - 明确控制台与 Convex 的边界

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| 任务总包过于抽象，无法指导后续实现 | medium | high | 以阶段、对象、验证和回退策略组织文档 | 后续讨论仍频繁回到“先做什么” | 继续细化 `01-plan.md` 和 `02-architecture.md` |
| 将探索型 agent 与 workflow/runtime 混为一谈 | medium | high | 在教学场景中强制定义收敛合同与审核边界 | 输出仍停留在聊天文本 | 退回 deterministic pipeline 并补 artifact schema |
| 在 platform foundation 未稳定前启动控制台或 connector implementation | high | high | 固定 `I1 -> I2 -> I3 -> I4` tranche 顺序，并对每个 tranche 设 admission criteria | 控制台/connector 实现开始反向定义对象与 API | 停止后置 tranche，回退到上一个已稳定 tranche |
| Convex 讨论打断主线 | medium | medium | 明确只保留“投影层候选”定位，并把实验放到 `I4` | 实施计划开始围绕 Convex 重写主数据面 | 暂时移出本任务范围 |

## Optional detailed documentation layout (convention)
If you maintain a detailed dev documentation bundle for the task, the repository convention is:

```txt
dev-docs/active/<task>/
  roadmap.md              # Macro-level planning (plan-maker)
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

The roadmap document can be used as the macro-level input for the other files. The plan-maker skill does not create or update those files.

Suggested mapping:
- The roadmap's **Goal/Non-goals/Scope** -> `00-overview.md`
- The roadmap's **Phases** -> `01-plan.md`
- The roadmap's **Architecture direction (high level)** -> `02-architecture.md`
- Decisions/deviations during execution -> `03-implementation-notes.md`
- The roadmap's **Verification** -> `04-verification.md`

## To-dos
- [x] Confirm `control-console` technical stack
- [x] Confirm teaching scenario first workflow wording
- [x] Confirm Phase 1 internal API boundary between platform API and runtime
- [x] Confirm whether Convex remains a documented candidate after Phase 0
- [x] Confirm the Phase 1 definition of done
- [ ] Open `B1 / ua-platform-foundation-implementation`
- [ ] Freeze owner and verification checklist for `B1-B4`
- [ ] Decide whether `apps/trigger-scheduler` ships as a new app in `B5` or starts inside `workflow-platform-api`
