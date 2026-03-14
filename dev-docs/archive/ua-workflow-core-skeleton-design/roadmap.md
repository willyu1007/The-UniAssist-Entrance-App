# Workflow Core Skeleton Design — Roadmap

## Goal
- 冻结 UniAssist 平台骨架的服务边界、命令路径、事件路径和 `P1` 最小正式对象集，使后续数据面、Builder、historical sample 场景和控制台设计都建立在同一套骨架前提上。

## Planning-mode context and merge policy
- Runtime mode signal: Default
- User confirmation when signal is unknown: not-needed
- Host plan artifact path(s): (none)
- Requirements baseline: `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > requirement.md > host plan artifact > model inference
- Repository SSOT output: `dev-docs/active/ua-workflow-core-skeleton-design/roadmap.md`
- Mode fallback used: non-Plan default applied: yes

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| User-confirmed instructions | Current chat request | 子包目标、职责边界、设计输出要求 | highest | 明确要求本轮只落设计子包，不实施代码 |
| Parent roadmap | `dev-docs/active/ua-openclaw-collab-platform/roadmap.md` | 阶段顺序、全局约束、已锁定决策 | high | `T-011` 为母任务 |
| Repository state | `apps/gateway/src/server.ts`, `apps/gateway/src/persistence.ts`, `apps/worker/src/worker.ts`, `packages/contracts/src/types.ts`, `prisma/schema.prisma` | 当前入口、时间线、outbox/worker、持久化边界 | high | 用于确定兼容层与复用策略 |
| Model inference | N/A | 文档结构与边界压缩 | lowest | 不覆盖已锁定决策 |

## Non-goals
- 不实施 `apps/workflow-platform-api`、`apps/workflow-runtime` 或任何运行时代码
- 不定义 historical sample 场景细节、Builder draft 模型或控制台页面 IA
- 不冻结 connector/action layer、`AgentDefinition`、trigger/scheduler 的实现方案
- 不改变现有 `/v0` 对外接口或前端 transport 行为

## Open questions and assumptions
### Open questions (answer before execution)
- Q1: 内部 HTTP 命令接口的最终路径命名是否要统一使用 `/internal/runtime/*` 与 `/internal/executors/*`，还是进一步收敛为单一 internal RPC 网关？
- Q2: formal event envelope 是否在 `P1` 就进入独立 contract 包，还是先记录在设计中，交给 `workflow-contracts` 子包落实？

### Assumptions (if unanswered)
- A1: `workflow-platform-api` 是统一命令入口与统一查询入口（risk: low）
- A2: `ingress-gateway` 继续持有 `/v0` 会话与 timeline 兼容面，但不再承接复杂工作流编排（risk: low）
- A3: `runtime + worker` 协作优于 runtime 自带后台循环或 worker 全盘接管（risk: low）
- A4: 现有 `outbox + Redis stream + worker` 是长期可演进基础设施，而不是短期过渡方案（risk: medium)

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | run 启动入口 | gateway 直调 runtime vs platform API 统一入口 | `workflow-platform-api` 统一入口 | 母任务已锁定 | 在本子包中冻结命令流 |
| C2 | timeline 投影归属 | runtime 直接写 timeline vs ingress 兼容投影 | `ingress-gateway` 负责最终 `/v0` 投影 | 母任务已锁定 | 在本子包中冻结 formal event 到 timeline 的映射 |
| C3 | continuation 位置 | runtime 内部循环 vs worker 全接管 vs 协作 | `runtime + worker` 协作 | 母任务已锁定 | 在本子包中冻结恢复协议 |
| C4 | P1 正式对象集 | 只做 run vs 同时含 agent/trigger | 先冻结 `workflow/run/artifact/approval`，排除 `AgentDefinition` | 母任务已锁定 | 在本子包中解释排除原因 |

## Scope and impact
- Affected areas/modules:
  - `apps/gateway`
  - `apps/worker`
  - `packages/contracts`
  - `prisma/schema.prisma`
  - future `apps/workflow-platform-api`
  - future `apps/workflow-runtime`
- External interfaces/APIs:
  - Keep `/v0/ingest`, `/v0/interact`, `/v0/events`, `/v0/stream`, `/v0/timeline`
  - Define minimal `/v1/workflows`, `/v1/runs`, `/v1/approvals`, `/v1/artifacts`
  - Define internal `start-run`, `resume-run`, `executor invoke`
- Data/storage impact:
  - 新增 formal workflow objects，但不移除现有 `/v0` tables
  - timeline 继续存在，定位改为兼容投影面
- Backward compatibility:
  - `/v0`、`providerId`、`task_question/task_state` 保持兼容

## Consistency baseline for dual artifacts (if applicable)
- [x] Goal is aligned with the parent roadmap
- [x] Boundaries/non-goals are aligned
- [x] Constraints are aligned
- [x] Service split is aligned with `Hybrid目标 + P1先HTTP`
- Intentional divergences:
  - 本子包比母任务更具体地冻结 internal command/query 路径与最小对象集

## Project structure change preview (may be empty)
This section is a **non-binding, early hypothesis** to help humans confirm expected project-structure impact.

### Existing areas likely to change (may be empty)
- Modify:
  - `dev-docs/active/ua-openclaw-collab-platform/`
- Delete:
  - (none)
- Move/Rename:
  - (none)

### New additions (landing points) (may be empty)
- New module(s) (preferred):
  - `dev-docs/active/ua-workflow-core-skeleton-design/`
  - future `apps/workflow-platform-api/`
  - future `apps/workflow-runtime/`
- New interface(s)/API(s) (when relevant):
  - `POST /v1/runs`
  - `POST /internal/runtime/start-run`
  - `POST /internal/runtime/resume-run`
  - `POST /internal/executors/{executorId}/invoke`
- New file(s) (optional):
  - design-only in this subtask

## Phases
1. **Phase 1**: 当前状态抽取与边界冻结
   - Deliverable: 服务职责、命令路径、事件路径结论
   - Acceptance criteria: 不再存在“谁启动 run / 谁投影 timeline / 谁做 continuation”的歧义
2. **Phase 2**: 最小对象集与状态机边界冻结
   - Deliverable: `P1` 正式对象列表与状态机边界
   - Acceptance criteria: 不再需要实现者决定 `AgentDefinition` 是否进 `P1`
3. **Phase 3**: 兼容映射、风险与回退策略
   - Deliverable: `/v0` 映射和回退路径
   - Acceptance criteria: 新平台骨架失效时，旧入口链路仍有明确降级方案

## Step-by-step plan (phased)
> Keep each step small, verifiable, and reversible.

### Phase 0 — Discovery
- Objective: 用现有 repo 事实确认兼容层与基础设施边界。
- Deliverables:
  - 当前 gateway / worker / contracts / prisma 现状摘要
  - 与母任务一致的边界假设
- Verification:
  - 所有高影响结论都有 repo 证据或母任务决策支撑
- Rollback:
  - N/A (design-only)

### Phase 1 — Service and interface freeze
- Objective: 固化平台骨架的职责与接口。
- Deliverables:
  - 服务职责图
  - command/query path
  - formal event / timeline projection path
- Verification:
  - 文档能明确回答命令入口、查询入口、投影责任和继续执行责任
- Rollback:
  - 若边界无法冻结，维持仅有母任务级结论，不启动后续设计子包

### Phase 2 — Object and state boundary freeze
- Objective: 固化 `P1` 最小对象集和状态边界。
- Deliverables:
  - 最小对象列表
  - run/node/approval/artifact 状态边界
  - `AgentDefinition` 排除说明
- Verification:
  - 文档能明确回答为什么 `P1` 不纳入 agent/trigger
- Rollback:
  - 若对象集不稳定，暂停数据面设计子包启动

### Phase 3 — Compatibility and handoff freeze
- Objective: 固化 `/v0` 映射、风险与回退策略。
- Deliverables:
  - `/v0` compatibility mapping
  - 风险与回退策略
  - handoff-ready design bundle
- Verification:
  - 后续 `data-plane`、`builder-draft`、`control-console` 子包可直接引用
- Rollback:
  - 继续停留在 `T-011` 母任务层面，不拆实现任务

## Verification and acceptance criteria
- Automated checks:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Manual checks:
  - 文档必须明确回答：
    - `/v0/ingest` 命中 workflow 后谁接手
    - `start-run` 和 `resume-run` 谁发命令、谁执行
    - runtime 状态如何进入当前 timeline
    - continuation 为什么是 `runtime + worker` 协作
    - 为什么 `AgentDefinition` 不进 `P1`
- Acceptance criteria:
  - 设计稿包含最小接口列表和最小对象列表
  - 不留“实现时再决定”的高影响空白
  - 与 `T-011` 总包一致，不推翻已锁定约束

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| gateway 再次承担 workflow orchestration | medium | high | 明确 gateway 只做入口与兼容投影 | 设计稿出现 gateway 直调 executor/runtime 细节编排 | 回退到 platform API 统一入口 |
| runtime 直接写 `/v0` timeline | medium | high | formal event 与 timeline projection 分层 | 设计稿把 runtime 和兼容事件混写 | 回退为 ingress 投影模式 |
| worker 承担过多业务状态机逻辑 | medium | medium | runtime 持有状态机，worker 只执行 continuation protocol | 设计稿把状态决策写进 worker | 回退为 runtime 协议主导 |
| `P1` 对象集膨胀到 agent/trigger | medium | high | 将 `P1` 对象集明确写死 | 新子包开始依赖 `AgentDefinition` | 暂停后续子包，先回写母任务 |

## Optional detailed documentation layout (convention)
If you maintain a detailed dev documentation bundle for the task, the repository convention is:

```txt
dev-docs/active/<task>/
  roadmap.md
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

## To-dos
- [ ] Freeze internal command path naming
- [ ] Freeze formal event envelope responsibility
- [ ] Freeze `/v0` compatibility mapping table
- [ ] Register the subtask in project governance
