# Connector Action Layer Design — Roadmap

## Goal
- 冻结 `connector / action / event bridge / browser fallback` 与 `executor / workflow / runtime` 的正式边界，为后续外部系统接入留出稳定落点。

## Planning-mode context and merge policy
- Runtime mode signal: Default
- User confirmation when signal is unknown: not-needed
- Host plan artifact path(s): (none)
- Requirements baseline:
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md`
  - `dev-docs/active/ua-workflow-data-plane-design/02-architecture.md`
  - `dev-docs/active/ua-teaching-assessment-scenario-design/02-architecture.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > parent task docs > model inference
- Repository SSOT output: `dev-docs/active/ua-connector-action-layer-design/roadmap.md`
- Mode fallback used: non-Plan default applied: yes

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| User-confirmed instructions | Current chat request | connector/action layer 应后置，但需要正式设计边界 | highest | 不进入本轮实施 |
| Parent roadmap | `dev-docs/active/ua-openclaw-collab-platform/roadmap.md` | 阶段位置、非目标与扩展方向 | high | `T-011` 为母任务 |
| Core skeleton design | `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md` | runtime/worker/platform API 边界 | high | `T-012` 为直接前置 |
| Data plane design | `dev-docs/active/ua-workflow-data-plane-design/02-architecture.md` | delivery/artifact/approval 事实对象边界 | high | 需要避免和 connector 混淆 |
| Teaching scenario design | `dev-docs/active/ua-teaching-assessment-scenario-design/02-architecture.md` | 首个不依赖 connector 的验证样本 | high | 用于证明 connector 应后置 |
| Model inference | N/A | object naming 和 interaction compression | lowest | 不覆盖已确认边界 |

## Non-goals
- 不实现任何 GitHub/Jira/Browser connector
- 不定义外部系统的详细 API adapter
- 不将 connector 重新包装成 provider-plan 的别名
- 不让本子包反向重写 `T-012` 的 runtime/worker 边界

## Open questions and assumptions
### Open questions (answer before execution)
- Q1: `ActionDefinition` 是否直接归属 `ConnectorDefinition`，还是允许 platform-native actions 独立存在？
- Q2: browser fallback 的责任是否只限于 action execution fallback，还是也负责 event ingestion fallback？

### Assumptions (if unanswered)
- A1: `Connector` 负责外部系统 identity、binding、events、actions capability registration（risk: low）
- A2: `Action` 是 side-effectful capability unit，不等于 executor node（risk: low）
- A3: `EventBridge` 负责把外部事件归一化为 workflow trigger/input，不拥有 workflow state machine（risk: low）
- A4: browser fallback 只在无稳定 API 时作为 action execution fallback，不成为主运行时（risk: medium）

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | connector 与 executor 的关系 | provider/executor 变体 vs 独立边界 | 独立边界，不能混同 | 用户明确要求后置单独设计 | 在本子包冻结 definitions |
| C2 | action 的定位 | workflow node vs external capability unit | external capability unit | 需要治理与 secret binding | 在本子包冻结 policy/auth binding |
| C3 | browser fallback 定位 | 主执行路径 vs fallback | 仅为 fallback | 母任务已后置 connector | 在本子包冻结非主路径边界 |
| C4 | event bridge 定位 | 第二 runtime vs ingress bridge | 外部事件归一化桥，不拥有状态机 | 与 `T-012` 一致 | 在本子包冻结交互面 |

## Scope and impact
- Affected areas/modules:
  - future connector registry/binding modules
  - future policy/auth/secret management
  - future browser automation bridge
- External interfaces/APIs:
  - external event ingestion
  - action invocation
  - connector binding / auth refresh
- Data/storage impact:
  - 需要 connector/action/binding/policy objects，但本子包只冻结设计
- Backward compatibility:
  - 不影响教学场景和 `P1/P2/P3` 主线

## Phases
1. **Phase 1**: boundary freeze
   - Deliverable: connector/action/event bridge/browser fallback 的角色定义
   - Acceptance criteria: 不再争论 connector 是不是 provider/executor 变体
2. **Phase 2**: governance freeze
   - Deliverable: auth/policy/secret binding 位置与 owner
   - Acceptance criteria: 不再争论高风险外部能力由谁治理
3. **Phase 3**: interaction freeze
   - Deliverable: 与 platform API/runtime/worker 的交互面
   - Acceptance criteria: 不再争论 connector 是否拥有状态机

## Verification and acceptance criteria
- Automated checks:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Manual checks:
  - 文档明确回答 connector、action、event bridge、browser fallback 各自是什么
  - 文档明确回答 auth/policy/secret binding 在哪里
  - 文档明确回答与 runtime/worker/platform API 的交互面
- Acceptance criteria:
  - 实现者不再需要决定 connector 是 provider 还是 executor 的变体
  - 不推翻 `T-012` 已冻结的 runtime/worker/platform API 边界

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| connector 被设计成第二套 runtime | medium | high | 强制 connector 不拥有 workflow 状态机 | 文档把状态推进写进 connector/event bridge | 回退到 bridge-only 定位 |
| action 与 executor 混用 | medium | high | 明确 action 是 external capability unit | 文档把 action 写成 workflow node 本身 | 回退到 capability registry 模型 |
| browser fallback 被滥用为默认集成路径 | medium | medium | 明确其只在 API 缺失时作为 fallback | 文档没有 API-first 假设 | 回退到 fallback-only 角色 |

## To-dos
- [ ] Freeze connector/action/event bridge/fallback definitions
- [ ] Freeze auth/policy/secret binding ownership
- [ ] Freeze interaction surfaces with runtime/platform API/worker
- [ ] Register the subtask in project governance
