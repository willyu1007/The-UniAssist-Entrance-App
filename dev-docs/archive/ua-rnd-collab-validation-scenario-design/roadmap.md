# R&D Collaboration Validation Scenario Design — Roadmap

## Goal
- 定义第二个验证场景，用研发协作流程压测 runtime/preset、connector/action、治理和双向事件桥，而不是只停留在教学验证样本。

## Planning-mode context and merge policy
- Runtime mode signal: Default
- User confirmation when signal is unknown: not-needed
- Host plan artifact path(s): (none)
- Requirements baseline:
  - `/Users/phoenix/Downloads/team-openclaw-collab-workflow-design-record-v0.2.md`
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-teaching-assessment-scenario-design/02-architecture.md`
  - `dev-docs/active/ua-connector-action-layer-design/02-architecture.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > parent task docs > design record > model inference
- Repository SSOT output: `dev-docs/active/ua-rnd-collab-validation-scenario-design/roadmap.md`
- Mode fallback used: non-Plan default applied: yes

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| Requirements doc | `/Users/phoenix/Downloads/team-openclaw-collab-workflow-design-record-v0.2.md` | 第二验证场景与能力回灌闭环 | high | 当前仅有教学验证包 |
| Parent roadmap | `dev-docs/active/ua-openclaw-collab-platform/roadmap.md` | 阶段排序与主线约束 | high | `T-011` 母任务 |
| Teaching scenario design | `dev-docs/active/ua-teaching-assessment-scenario-design/02-architecture.md` | 第一验证场景的对照样本 | high | 需要避免重复验证同类能力 |
| Connector action design | `dev-docs/active/ua-connector-action-layer-design/02-architecture.md` | connector/action/event bridge 压测入口 | high | 直接依赖 |

## Non-goals
- 不实现具体 GitHub/Jira/CI/Monitoring connector
- 不把某一研发工具品牌写死为平台基线
- 不直接升级 Work Graph 为一级平台对象

## Open questions and assumptions
### Open questions (answer before implementation)
- Q1: 第二验证场景是聚焦“变更请求/发布协作”，还是聚焦“缺陷处理/事件响应”更合适？
- Q2: Work Graph 是否在此场景中仅作为 overlay 观察对象，而不立即升格？

### Assumptions (if unanswered)
- A1: 第二验证场景应强制压到 connector/action、event bridge、approval、scope/env governance（risk: low）
- A2: 不写死 GitHub/Jira/CI 品牌名，优先抽象成 source-control / issue-tracker / CI / monitoring capability（risk: low）
- A3: Work Graph 首版仍作为 overlay，而不是新的一级对象（risk: medium）

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | 验证重心 | 继续只用教学场景 vs 增加研发场景 | 必须增加第二验证场景 | 设计记录 v0.2 明确要求双场景回灌 | 新增本子包 |
| C2 | 场景抽象层级 | 绑定某工具品牌 vs 能力类别抽象 | 抽象为研发协作能力类别 | 避免把验证样本写成平台默认工具栈 | 冻结能力映射 |
| C3 | Work Graph | 立即一级化 vs 先 overlay | 先作为 overlay 验证 | 设计记录仍将其视为待观察项 | 冻结非目标 |
| C4 | 第二场景主流程 | 变更/发布协作 vs 缺陷/事件响应 | 以变更/发布协作为主 | 避免范围过泛，优先压测主线治理与写回 | 冻结 scenario objective |
| C5 | 首版能力组合 | 四类能力全上 vs 收缩到主链三类 | 首版只强制包含 `issue_tracker + source_control + ci_pipeline` | 避免第二验证场景一上来变成大而全集成测试 | 冻结 capability set |
| C6 | 压测最低要求 | 只要有流程即可 vs 必须有受治理写操作和异步回调 | 必须至少包含 1 个受治理外部写操作和 1 个异步 callback 点 | 否则压不到 connector/action/event bridge/governance 的硬缺口 | 冻结 pressure minimum |

## Scope and impact
- Affected areas/modules:
  - future connector/action implementations
  - future runtime/preset stress tests
  - future control-console queue/runboard views
- External interfaces/APIs:
  - issue / code / CI / monitoring capability classes
  - event bridge / callback / review flows
- Data/storage impact:
  - 需要定义研发场景下的核心 artifacts、approval points、delivery summary
- Backward compatibility:
  - 不影响教学场景作为第一验证样本的地位

## Phases
1. **Phase 1**: scenario objective freeze
2. **Phase 2**: flow and artifact freeze
3. **Phase 3**: pressure-point and feedback-loop freeze

## Verification and acceptance criteria
- Automated checks:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Manual checks:
  - 文档明确给出第二验证场景的流程与核心 artifacts
  - 文档明确给出它如何压测 connector/action/event bridge/governance
  - 文档明确给出哪些复杂度属于 runtime/preset，哪些是真正平台硬缺口
- Acceptance criteria:
  - 后续不会再把“教学场景通过”误判成“团队版 OpenClaw 全部主体需求已被验证”

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| 第二验证场景再次退化成平台抽象讨论 | medium | high | 强制定义具体 flow、artifact、approval、callback | 文档只有原则，没有流程 | 回退并补 flow |
| 场景绑定单一品牌工具 | medium | medium | 用 capability 类别抽象 | 文档写死单一工具名 | 回退到 generic capability mapping |

## To-dos
- [x] Freeze second validation scenario objective
- [x] Freeze flow, artifacts, approvals, callbacks
- [x] Freeze feedback loop to platform assets
- [x] Register the subtask in project governance
