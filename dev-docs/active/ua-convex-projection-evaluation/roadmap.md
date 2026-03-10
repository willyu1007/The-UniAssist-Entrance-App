# Convex Projection Evaluation — Roadmap

## Goal
- 评估 Convex 是否适合作为 workflow 平台的后续 projection/read-model 层，并明确其不能承担的职责、进入条件和退出条件。

## Planning-mode context and merge policy
- Runtime mode signal: Default
- User confirmation when signal is unknown: not-needed
- Host plan artifact path(s): (none)
- Requirements baseline:
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-workflow-data-plane-design/02-architecture.md`
  - `dev-docs/active/ua-control-console-foundation-design/02-architecture.md`
  - `dev-docs/active/ua-connector-action-layer-design/02-architecture.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > parent task docs > model inference
- Repository SSOT output: `dev-docs/active/ua-convex-projection-evaluation/roadmap.md`
- Mode fallback used: non-Plan default applied: yes

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| User-confirmed instructions | Current chat request | Convex 只作为后置投影评估，不进主数据面 | highest | 已明确不是首期主账本 |
| Parent roadmap | `dev-docs/active/ua-openclaw-collab-platform/roadmap.md` | 全局边界、后置阶段位置 | high | `T-011` 为母任务 |
| Data plane design | `dev-docs/active/ua-workflow-data-plane-design/02-architecture.md` | authoritative store 与 projection 边界 | high | `T-013` 是直接前提 |
| Control console design | `dev-docs/active/ua-control-console-foundation-design/02-architecture.md` | 候选 read models 和 query usage | high | `T-016` 提供 UI 需求 |
| Connector design | `dev-docs/active/ua-connector-action-layer-design/02-architecture.md` | 若后续引入 external events/actions，需要评估同步复杂度 | high | `T-017` 为最终前置 |
| Model inference | N/A | go/no-go rubric 压缩 | lowest | 不覆盖已确认边界 |

## Non-goals
- 不把 Convex 引入主数据面
- 不实现任何同步管道或 UI 接入
- 不重写 `workflow-platform-api` 的 query ownership
- 不在本子包中再次争论主数据库选型

## Open questions and assumptions
### Open questions (answer before execution)
- Q1: 候选 projection 是仅限控制台 read model，还是也包含协作通知/订阅 feed？
- Q2: 如果 Convex 不通过评估，控制台 read model 是否仍完全由 `workflow-platform-api` 自身负责？

### Assumptions (if unanswered)
- A1: authoritative store 继续是 Postgres/Prisma，不可更改（risk: low）
- A2: Convex 只可能承接 projection/read-model、订阅类场景（risk: low）
- A3: 即使引入 Convex，命令写入依然走 `workflow-platform-api`（risk: low）
- A4: 若评估结论不充分，默认 go/no-go = no-go，继续用现有 query surface（risk: low）

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | Convex 角色 | 主库/主后端 vs 投影层 | 只评估投影层 | 用户已确认 | 在本子包冻结排除项 |
| C2 | 评估时机 | 立即进入 vs 后置 | 在 connector/action 边界稳定后评估 | 已锁定为后续子包 | 仅形成 go/no-go 结论 |
| C3 | 控制台数据源 | 直接读 Convex vs 统一 API | 即使采用 Convex，也需经由明确的同步/ownership 设计 | `T-016` 已锁定 query ownership | 在本子包冻结同步原则 |

## Scope and impact
- Affected areas/modules:
  - future projection pipelines
  - future control-console subscription/read model integration
- External interfaces/APIs:
  - 仅评估 projection sync boundary，不新增外部 API
- Data/storage impact:
  - 不改变 authoritative store
  - 只评估候选 read models
- Backward compatibility:
  - 不影响任何已规划主线

## Phases
1. **Phase 1**: projection candidacy freeze
   - Deliverable: 候选 read models 清单
   - Acceptance criteria: 不再争论 Convex 是否能承接主数据面
2. **Phase 2**: sync and failure-boundary freeze
   - Deliverable: 同步原则、失效影响和 ownership 约束
   - Acceptance criteria: 不再争论命令路径是否可以绕过平台 API
3. **Phase 3**: go/no-go rubric freeze
   - Deliverable: 进入条件、退出条件、明确结论
   - Acceptance criteria: 后续不再反复重开“Convex 要不要上主库”讨论

## Verification and acceptance criteria
- Automated checks:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Manual checks:
  - 文档明确给出 Convex 能做和不能做的事
  - 文档明确给出候选 read models
  - 文档明确给出 go/no-go 与退出条件
- Acceptance criteria:
  - 后续不会再围绕“Convex 是否做主库”反复讨论
  - 控制台和 projection 设计有明确后续落点或明确排除

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| 评估任务重新演化成主数据库重选 | low | high | 在文档开头写死 authoritative store 不变 | 文档开始比较主库替换路径 | 回退到 projection-only scope |
| 没有明确退出条件，后续继续摇摆 | medium | medium | 强制写 go/no-go 和 exit criteria | 文档只写优点，不写放弃条件 | 回退补足 rubric |
| 候选 read model 过泛 | medium | medium | 只围绕控制台和协作订阅类场景 | 文档把大量未验证域都列入 | 收缩到最少候选项 |

## To-dos
- [ ] Freeze candidate read models
- [ ] Freeze sync/ownership principles
- [ ] Freeze go/no-go rubric and exit criteria
- [ ] Register the subtask in project governance
