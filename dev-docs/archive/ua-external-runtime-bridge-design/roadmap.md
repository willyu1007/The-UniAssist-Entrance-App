# External Runtime Bridge Design — Roadmap

## Goal
- 冻结外部 agent/runtime 与平台之间的桥接边界，补齐“可接入外部 runtime”的主体需求。

## Planning-mode context and merge policy
- Runtime mode signal: Default
- User confirmation when signal is unknown: not-needed
- Host plan artifact path(s): (none)
- Requirements baseline:
  - `/Users/phoenix/Downloads/team-openclaw-collab-workflow-design-record-v0.2.md`
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md`
  - `dev-docs/active/ua-connector-action-layer-design/02-architecture.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > parent task docs > design record > model inference
- Repository SSOT output: `dev-docs/active/ua-external-runtime-bridge-design/roadmap.md`
- Mode fallback used: non-Plan default applied: yes

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| Requirements doc | `/Users/phoenix/Downloads/team-openclaw-collab-workflow-design-record-v0.2.md` | external runtime bridge, LangGraph-like integration | high | 当前仅有总包提法 |
| Parent roadmap | `dev-docs/active/ua-openclaw-collab-platform/roadmap.md` | 阶段位置与主线约束 | high | `T-011` 母任务 |
| Core skeleton design | `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md` | runtime / worker / platform API ownership | high | 直接依赖 |
| Connector action design | `dev-docs/active/ua-connector-action-layer-design/02-architecture.md` | invoke contract 与 callback/bridge 近邻边界 | high | 需要避免混义 |

## Non-goals
- 不实现具体 LangGraph/OpenAI/其他 runtime 适配器
- 不把平台本身改造成外部 runtime 的别名
- 不定义 secret/policy 最终存储
- 不实现长期 agent trigger

## Open questions and assumptions
### Open questions (answer before implementation)
- Q1: bridge 首期是单独 deployable，还是先作为 executor/bridge app 合并部署？
- Q2: callback/checkpoint 协议是否需要独立包，还是先挂在 `workflow-contracts` 下？

### Assumptions (if unanswered)
- A1: 外部 runtime 只提供执行语义，不拥有平台控制面主权（risk: low）
- A2: runtime bridge 必须回推结构化状态，而不是只回传聊天文本（risk: low）
- A3: approval/artifact/delivery 的正式对象仍由平台维护（risk: low）

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | 外部 runtime 的定位 | 平台核心 vs 被接入执行体 | 被接入执行体 | 设计记录与总包一致 | 冻结 owner |
| C2 | callback owner | bridge 直接改 workflow state vs handoff 给 runtime | handoff 给 runtime | `T-012` 已冻结状态机 ownership | 冻结 callback protocol |
| C3 | artifact/approval owner | 外部 runtime 直接拥有 vs 平台 authoritative store | 平台 authoritative store | `T-018` 已冻结 data plane | 冻结 formal object ownership |
| C4 | bridge registry 归属 | connector registry vs executor/capability registry | executor/capability registry | bridge 是执行语义桥接，不是外部业务系统接入 | 冻结 registration owner |
| C5 | callback 类型粒度 | callback 类型全面展开 vs 先收敛为最小集合 | 首版固定为 `checkpoint / result / error / approval_requested` | 先稳定 handoff，不提前膨胀协议类型 | 冻结 callback set |

## Scope and impact
- Affected areas/modules:
  - future `apps/executor-bridge-*`
  - future runtime callback protocol
  - future control-plane bridge registration
- External interfaces/APIs:
  - invoke external runtime
  - node callback / checkpoint / resume
  - structured artifact / approval / delivery result handoff
- Data/storage impact:
  - 需要冻结 bridge registration、invoke/callback/checkpoint 边界
- Backward compatibility:
  - 不影响 `/v0` compatibility 和现有 provider 示例

## Phases
1. **Phase 1**: bridge role freeze
2. **Phase 2**: invoke and callback freeze
3. **Phase 3**: formal object ownership freeze

## Verification and acceptance criteria
- Automated checks:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Manual checks:
  - 文档明确回答 bridge 与 platform/runtime 的 owner 区分
  - 文档明确回答 invoke/checkpoint/callback 的 handoff
  - 文档明确回答 artifact/approval/delivery 由谁记为正式对象
- Acceptance criteria:
  - 后续实现者不再需要决定“平台是不是等于外部 runtime”

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| 把平台退化成某个外部 runtime 的壳 | medium | high | 固定 bridge-only 定位 | 文档把外部 runtime 写成平台 state owner | 回退到 bridge adapter 模型 |
| callback 越界直接修改 workflow state | medium | high | callback 统一交给 platform/runtime | 文档缺少 handoff 层 | 回退到 runtime-owned transitions |

## To-dos
- [x] Freeze bridge role and object boundary
- [x] Freeze invoke/checkpoint/callback handoff
- [x] Freeze formal object ownership
- [x] Register the subtask in project governance
