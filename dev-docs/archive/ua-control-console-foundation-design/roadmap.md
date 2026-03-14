# Control Console Foundation Design — Roadmap

## Goal
- 冻结 `control-console` 的首期技术栈、信息架构、页面优先级和查询路径，使其成为独立 Web 控制面，而不是聊天面的附属视图。

## Planning-mode context and merge policy
- Runtime mode signal: Default
- User confirmation when signal is unknown: not-needed
- Host plan artifact path(s): (none)
- Requirements baseline:
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md`
  - `dev-docs/active/ua-builder-draft-sot-design/02-architecture.md`
  - `dev-docs/archive/ua-teaching-assessment-scenario-design/02-architecture.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > parent task docs > model inference
- Repository SSOT output: `dev-docs/active/ua-control-console-foundation-design/roadmap.md`
- Mode fallback used: non-Plan default applied: yes

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| User-confirmed instructions | Current chat request | 控制面复杂度高、需要独立讨论技术栈 | highest | 已锁定 Web 控制台方向 |
| Parent roadmap | `dev-docs/active/ua-openclaw-collab-platform/roadmap.md` | `React + Vite`、控制台首期作用域 | high | `T-011` 为母任务 |
| Core skeleton design | `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md` | 控制台查询只能走 `workflow-platform-api` | high | `T-012` 为服务边界基础 |
| Builder draft design | `dev-docs/active/ua-builder-draft-sot-design/02-architecture.md` | Studio/Draft Inspector 的对象模型 | high | `T-013` 为直接依赖 |
| Historical sample scenario design | `dev-docs/archive/ua-teaching-assessment-scenario-design/02-architecture.md` | Runboard/Approval/Delivery 的首个验证场景输入 | high | `T-017` 为历史样例输入 |
| Model inference | N/A | route grouping 与 view model 压缩 | lowest | 不覆盖已锁定决策 |

## Non-goals
- 不实现任何 Web 前端代码
- 不做画布式 builder/editor
- 不设计完整 policy/registry 管理台
- 不让控制台直接访问 runtime/DB/Convex

## Open questions and assumptions
### Open questions (answer before execution)
- Q1: 首期是否需要在 `Workflow Studio` 中支持多人并发编辑提示，还是先只做 revision-aware 单人编辑？
- Q2: `Artifact Explorer` 是否推迟到 Runboard/Approval/Draft Inspector 稳定后再进入首期导航？

### Assumptions (if unanswered)
- A1: 技术栈锁定为 `React + Vite + TypeScript`（risk: low）
- A2: 路由与数据层优先采用 `TanStack Router` + `TanStack Query`（risk: medium）
- A3: 首批页面锁定为 `Runboard`, `Approval Inbox`, `Draft Inspector`, `Workflow Studio`（risk: low）
- A4: Studio 首期采用 `spec-first + conversational intake + mixed editing + 只读 DAG 预览`，不做画布（risk: low）

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | 技术栈 | `Next.js` vs `React + Vite` | `React + Vite` | 母任务已锁定 | 在本子包补足路由/数据层建议 |
| C2 | 控制台角色 | 复用聊天面 vs 独立 Web app | 独立 Web 控制面 | 用户已确认 | 冻结查询边界和页面优先级 |
| C3 | Studio 形态 | canvas-first vs spec-first | spec-first + read-only DAG preview | 已确认不做首期画布 | 在本子包冻结 Studio scope |
| C4 | 数据获取 | 直连 DB/runtime vs 统一 API | 统一走 `workflow-platform-api` | `T-012` 已锁定 | 在本子包冻结 view model 依赖 |

## Scope and impact
- Affected areas/modules:
  - future `apps/control-console`
  - future `packages/shared-models`
  - future `ui/` contract usage for Web
- External interfaces/APIs:
  - `/v1/runs`
  - `/v1/approvals`
  - draft/query APIs via `workflow-platform-api`
- Data/storage impact:
  - 无直接主数据面职责，只定义 view model 所依赖的 authoritative sources
- Backward compatibility:
  - 不影响 `/v0` chat surface

## Phases
1. **Phase 1**: stack and routing freeze
   - Deliverable: Web stack、route groups、query ownership
   - Acceptance criteria: 不再争论 Vite/Next、直连/走 API
2. **Phase 2**: page priority freeze
   - Deliverable: 首批页面与 view model 清单
   - Acceptance criteria: 不再争论先做什么页
3. **Phase 3**: Studio scope freeze
   - Deliverable: Workflow Studio 的首期能力边界
   - Acceptance criteria: 不再争论是否做画布或 full registry

## Verification and acceptance criteria
- Automated checks:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Manual checks:
  - 文档明确给出技术栈、路由分区、查询边界
  - 文档明确给出首批页面和 view model 依赖
  - 文档明确给出 Studio scope 与非目标
- Acceptance criteria:
  - 实现者不再需要决定控制台先做什么页、是否做画布、是否直连数据库
  - 控制台设计可直接消费 `T-012/T-014/T-015` 输出

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| 控制台重新长成第二个后端 | medium | high | 强制所有数据都走 `workflow-platform-api` | 文档允许 control console 直连 DB/runtime | 回退到统一 query surface |
| 首期 IA 过大 | medium | medium | 明确只做四个主区，压缩 policy/registry | 文档开始扩展大量 admin 子系统 | 收缩到 Runboard/Approval/Draft/Studio |
| Studio 被误做成画布产品 | medium | medium | 写清 spec-first 与 read-only DAG preview | 文档出现拖拽画布或 full canvas 设计 | 回退到 text/spec editor scope |

## To-dos
- [ ] Freeze Web stack and route groups
- [ ] Freeze first-page priority and view models
- [ ] Freeze Workflow Studio scope
- [ ] Register the subtask in project governance
