# Workflow Data Plane Design — Roadmap

## Goal
- 冻结 UniAssist 协作 workflow 平台的主数据面，明确 authoritative objects、projection 边界，以及 `actor graph / audience selector / delivery spec` 是否进入 `P1`。

## Planning-mode context and merge policy
- Runtime mode signal: Default
- User confirmation when signal is unknown: not-needed
- Host plan artifact path(s): (none)
- Requirements baseline:
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > parent task docs > model inference
- Repository SSOT output: `dev-docs/active/ua-workflow-data-plane-design/roadmap.md`
- Mode fallback used: non-Plan default applied: yes

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| User-confirmed instructions | Current chat request | 子包目标、范围、DoD、推进顺序 | highest | 明确要求本轮只确认设计子包 |
| Parent roadmap | `dev-docs/active/ua-openclaw-collab-platform/roadmap.md` | 全局阶段、主数据面策略、`/v0` 兼容约束 | high | `T-011` 为母任务 |
| Core skeleton design | `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md` | 服务边界、formal event ownership、`P1` 最小核心对象 | high | `T-012` 为直接前置 |
| Repository DB SSOT | `prisma/schema.prisma`, `docs/project/db-ssot.json` | 当前 authoritative store 与 schema 变更入口 | high | 保持 Prisma/Postgres 为主账本 |
| Model inference | N/A | 对象命名、层次压缩 | lowest | 不覆盖已锁定边界 |

## Non-goals
- 不实施 Prisma schema 变更或数据库迁移
- 不定义 Builder draft 对象和发布治理细节
- 不定义教学 parser 的内部实现或 prompt 设计
- 不把 timeline、runboard 或 approval inbox 的 read model 误当 authoritative store

## Open questions and assumptions
### Open questions (answer before execution)
- Q1: `actor graph` 的最小建模是否采用 `ActorProfile + ActorMembership/Edge`，还是直接使用更宽的 `Party` 抽象？
- Q2: `delivery spec` 是否需要在 `P1` 就包含 channel-level payload 模板，还是只冻结受众、策略和 artifact binding？

### Assumptions (if unanswered)
- A1: `T-012` 冻结的 `workflow/run/node/artifact/approval` 仍是 `P1` 不可削减核心对象集（risk: low）
- A2: `actor graph / audience selector / delivery spec` 作为 `P1` companion objects 进入主数据面，而不是后置到 `P2`（risk: low）
- A3: `TimelineEvent`、chat cards、runboard 聚合视图都属于 projection，不是 authoritative objects（risk: low）
- A4: Postgres/Prisma 继续作为 authoritative store；Convex 不进入本子包的数据归属承诺（risk: low）

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | `actor/delivery` 是否进 `P1` | 只保留 `run/artifact/approval` vs 同期补齐交付原语 | 作为 `P1` companion objects 进入主数据面 | 用户明确要求 data plane 覆盖 actor/delivery | 在本子包冻结对象和生命周期 |
| C2 | timeline 的地位 | timeline 作为事实源 vs projection | timeline 明确降级为 projection | 母任务和骨架子包已锁定 | 在本子包冻结 authoritative/projection 边界 |
| C3 | 控制台读取路径 | 直读 DB/read replica vs 统一 API 查询 | 统一走 `workflow-platform-api` query surface | `T-012` 已锁定 | 本子包只提供 authoritative model，不承诺直连读取 |
| C4 | 数据面重心 | workflow-only vs workflow + actor + delivery | 采用 workflow-centric plus delivery-aware data plane | 用户已确认教学/fan-out 是首批重点 | 给后续 teaching/console 直接复用 |

## Scope and impact
- Affected areas/modules:
  - `prisma/schema.prisma`
  - future `packages/workflow-contracts`
  - future `apps/workflow-platform-api`
  - `apps/gateway` compatibility mapping
  - `apps/worker` projection/continuation consumers
- External interfaces/APIs:
  - 影响 `/v1/workflows`, `/v1/runs`, `/v1/approvals`, `/v1/artifacts`
  - 为后续 `audiences` / `deliveries` / `actors` 提供对象基础，但不要求本包定义完整 REST 面
- Data/storage impact:
  - 新增 workflow core、artifact/approval、actor graph、audience selector、delivery spec 的 authoritative objects
  - projection objects 继续通过 timeline/read model 体现
- Backward compatibility:
  - `/v0` 保持不变
  - `task_question/task_state` 继续由 compatibility projection 产生

## Phases
1. **Phase 1**: authoritative object inventory freeze
   - Deliverable: 核心对象与 companion objects 清单
   - Acceptance criteria: 不再争论 actor/delivery 是否进 `P1`
2. **Phase 2**: lifecycle and ownership freeze
   - Deliverable: run/node/artifact/approval/actor/delivery 生命周期与 owner
   - Acceptance criteria: 每类对象都能分清 authoritative vs projection
3. **Phase 3**: compatibility and read-model freeze
   - Deliverable: `/v0` 兼容映射和 projection 边界
   - Acceptance criteria: teaching/builder/console 子包可直接引用

## Step-by-step plan (phased)
### Phase 0 — Discovery
- Objective: 从 `T-012` 与现有 Prisma SSOT 抽出现状和边界。
- Deliverables:
  - 当前 authoritative store 摘要
  - 需要新增的对象域清单
- Verification:
  - 结论与 `T-012` 不冲突

### Phase 1 — Object inventory freeze
- Objective: 冻结 `P1` data plane 的正式对象。
- Deliverables:
  - core objects
  - actor graph objects
  - audience/delivery objects
- Verification:
  - 文档能回答每个对象为何属于 authoritative store

### Phase 2 — Lifecycle and ownership freeze
- Objective: 明确状态、归属和关系边界。
- Deliverables:
  - lifecycle tables
  - relationship rules
  - authoritative vs projection matrix
- Verification:
  - 后续实现者无需再决定事实源归属

### Phase 3 — Compatibility freeze
- Objective: 明确 `/v0` 映射和投影方式。
- Deliverables:
  - `/v0` compatibility mapping
  - runboard/approval/timeline projection boundary
- Verification:
  - builder/teaching/console 子包可直接引用，不再各自重定义

## Verification and acceptance criteria
- Automated checks:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Manual checks:
  - 文档明确列出 authoritative objects 与 projection objects
  - 文档明确回答 `actor/delivery` 是否进入 `P1`
  - 文档明确给出生命周期和 `/v0` 兼容映射
- Acceptance criteria:
  - 实现者不再需要决定 `actor/delivery` 是否进入 `P1`
  - teaching / builder / control-console 子包可以直接复用对象定义

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| 仍把 timeline 当主数据面 | medium | high | 强制写清 authoritative/projection matrix | 文档出现“timeline source of truth”措辞 | 回退到 formal object 中心叙述 |
| `actor/delivery` 建模过度抽象 | medium | medium | 只冻结最小 companion objects 与关系，不做过深泛化 | 文档出现大量无场景支撑的抽象实体 | 收缩为 teaching 所需最小原语 |
| 与 `T-012` 的最小对象集冲突 | low | high | 明确说明这是 companion scope，而非替换 `T-012` core set | 文档重写 `T-012` 已冻结对象集 | 回退并改为补充性对象层 |

## To-dos
- [ ] Freeze authoritative object inventory
- [ ] Freeze lifecycle and ownership tables
- [ ] Freeze `/v0` compatibility mapping
- [ ] Register the subtask in project governance
