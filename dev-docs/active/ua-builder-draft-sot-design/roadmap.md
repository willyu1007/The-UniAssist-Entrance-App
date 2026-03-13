# Builder Draft SoT Design — Roadmap

## Goal
- 冻结 Builder 双入口、`Control Plane Draft` 单一事实源、发布治理分层，以及 `recipe draft` 的生成与晋升路径。

## Planning-mode context and merge policy
- Runtime mode signal: Default
- User confirmation when signal is unknown: not-needed
- Host plan artifact path(s): (none)
- Requirements baseline:
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md`
  - `dev-docs/active/ua-workflow-data-plane-design/02-architecture.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > parent task docs > model inference
- Repository SSOT output: `dev-docs/active/ua-builder-draft-sot-design/roadmap.md`
- Mode fallback used: non-Plan default applied: yes

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| User-confirmed instructions | Current chat request | 双入口、SoT、publish/activate 风险分层、recipe draft 范围 | highest | 已明确需要避免“各自产生一套草稿” |
| Parent roadmap | `dev-docs/active/ua-openclaw-collab-platform/roadmap.md` | 全局治理与 builder 方向 | high | `T-011` 为母任务 |
| Core skeleton design | `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md` | 所有命令/query 必须通过 platform API | high | `T-012` 为上游骨架 |
| Data plane design | `dev-docs/active/ua-workflow-data-plane-design/02-architecture.md` | draft 需要落到 authoritative objects 之上 | high | `T-013` 为直接数据前置 |
| Model inference | N/A | 控制面对象命名与生命周期压缩 | lowest | 不覆盖已确认边界 |

## Non-goals
- 不实现聊天 Builder、控制台 Studio 或任何 UI
- 不定义控制台页面 IA
- 不定义 `CompiledCapability` 或长期 agent activation 的完整治理实现
- 不讨论 parser/prompt 的内部策略细节

## Open questions and assumptions
### Open questions (answer before execution)
- Q1: `WorkflowDraft` 与 `RecipeDraft` 是否采用完全独立对象，还是 `DraftKind` 统一建模更合适？
- Q2: `publish` 后是否允许继续产生新的 editable draft revision，还是要求 fork 新 draft line？

### Assumptions (if unanswered)
- A1: 聊天面和控制台都只能通过 `workflow-platform-api` 读写同一个 draft SoT（risk: low）
- A2: `publish`、`activate`、`bind secret`、`schedule`、`external write` 必须拆成不同风险层级（risk: low）
- A3: `recipe draft` 是控制面对象，不是 run-time projection，也不是聊天消息（risk: low）
- A4: 所有人都可以发布 workflow template，但高风险能力的启用仍需治理（risk: low）

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | Builder 入口 | chat-only vs control-console-only vs dual-entry | 双入口，但同一个 draft SoT | 用户已确认 | 在本子包冻结 draft lifecycle |
| C2 | 草稿事实源 | 前端本地状态 vs control-plane object | `Control Plane Draft` 是唯一事实源 | 用户已确认 | 明确 command ownership |
| C3 | 发布语义 | publish=everything vs publish/activate/bind 拆分 | 拆分为风险分层动作 | 用户已确认“高风险能力另审” | 在本子包冻结 gating matrix |
| C4 | recipe draft 位置 | 聊天输出 vs run projection vs control-plane object | 作为 control-plane draft lineage 对象 | 首个 historical sample validation 场景需要收敛与晋升路径 | 在本子包冻结生成/审核/晋升流程 |

## Scope and impact
- Affected areas/modules:
  - future `apps/workflow-platform-api`
  - future `apps/control-console`
  - `apps/frontend` chat surface integration
  - future `packages/workflow-contracts`
- External interfaces/APIs:
  - future `/v1/workflows/*draft*`, `/v1/workflows/*publish*`, `/v1/workflows/*activate*`
  - chat surface builder entry to platform API
- Data/storage impact:
  - 需要 control-plane draft objects，但本子包只冻结设计，不落 schema
- Backward compatibility:
  - `/v0` 不必理解 draft 对象
  - builder 输出最终仍需映射到 workflow template/version

## Phases
1. **Phase 1**: draft object and lifecycle freeze
   - Deliverable: `WorkflowDraft` / `RecipeDraft` 与修订规则
   - Acceptance criteria: 不再争论 draft 放哪、谁是 SoT
2. **Phase 2**: dual-entry command model freeze
   - Deliverable: chat/control-console 对同一 draft 的 command path
   - Acceptance criteria: 不再允许双端各自持有独立草稿事实源
3. **Phase 3**: governance and promotion freeze
   - Deliverable: publish/activate/bind/schedule 风险矩阵，recipe draft 晋升路径
   - Acceptance criteria: “人人可发布 template” 与高风险治理不冲突

## Verification and acceptance criteria
- Automated checks:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Manual checks:
  - 文档明确给出双入口模型和 command ownership
  - 文档明确给出 draft lifecycle 与 risk gating matrix
  - 文档明确给出 recipe draft 的生成、审核、晋升路径
- Acceptance criteria:
  - 实现者不再需要决定 draft 放哪、谁能发布、recipe draft 在哪生成
  - 与 `T-011`、`T-012`、`T-013` 保持一致

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| 双入口最后演化成两个独立草稿系统 | medium | high | 强制所有入口都落到 platform API draft commands | 文档允许前端本地草稿成为事实源 | 回退到 control-plane-only SoT |
| `publish` 概念被用来偷渡高风险执行能力 | medium | high | 将 `publish` 与 `activate/bind/schedule/external write` 显式拆开 | 文档把所有动作都叫 publish | 回退为分层治理矩阵 |
| `recipe draft` 退化为聊天消息或 loose notes | medium | medium | 要求 recipe draft 是结构化对象并可晋升 | 文档没有结构化 lineage | 回退为独立 control-plane draft |

## To-dos
- [ ] Freeze `WorkflowDraft` / `RecipeDraft` lifecycle
- [ ] Freeze dual-entry command model
- [ ] Freeze publish / activate / bind / schedule risk matrix
- [ ] Register the subtask in project governance
