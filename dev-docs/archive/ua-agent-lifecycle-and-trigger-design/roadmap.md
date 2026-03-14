# Agent Lifecycle and Trigger Design — Roadmap

## Goal
- 冻结 `AgentDefinition / trigger / activation` 的正式边界，补齐“workflow 不等于 agent”的控制面能力缺口。

## Planning-mode context and merge policy
- Runtime mode signal: Default
- User confirmation when signal is unknown: not-needed
- Host plan artifact path(s): (none)
- Requirements baseline:
  - `/Users/phoenix/Downloads/team-openclaw-collab-workflow-design-record-v0.2.md`
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md`
  - `dev-docs/active/ua-builder-draft-sot-design/02-architecture.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > parent task docs > design record > model inference
- Repository SSOT output: `dev-docs/active/ua-agent-lifecycle-and-trigger-design/roadmap.md`
- Mode fallback used: non-Plan default applied: yes

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| User-confirmed instructions | Current chat request | 为补齐 v0.2 主体需求增加设计子包 | highest | 仅创建设计包，不进入实现 |
| Requirements doc | `/Users/phoenix/Downloads/team-openclaw-collab-workflow-design-record-v0.2.md` | `AgentDefinition`, trigger, scheduler, activation 边界 | high | 当前规划尚未单独承接 |
| Parent roadmap | `dev-docs/active/ua-openclaw-collab-platform/roadmap.md` | 任务编排与阶段位置 | high | `T-011` 母任务 |
| Core skeleton design | `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md` | control/runtime/worker ownership | high | `AgentDefinition` 被明确排除在 `P1` 外 |
| Builder draft design | `dev-docs/active/ua-builder-draft-sot-design/02-architecture.md` | publish vs activate/bind 风险分层 | high | 直接影响激活语义 |

## Non-goals
- 不实现 `trigger-scheduler`
- 不实现长期常驻 agent 或 webhook/schedule 基础设施
- 不定义 secret storage 或 scope grant 细节
- 不定义外部 runtime bridge 的厂商适配

## Open questions and assumptions
### Open questions (answer before implementation)
- Q1: 首版 `AgentDefinition` 是否必须独立于 `WorkflowTemplateVersion` 建表，还是先以 control-plane object 逻辑冻结即可？
- Q2: `trigger-scheduler` 是独立 deployable，还是首期先并入 `workflow-platform-api`/`worker`？

### Assumptions (if unanswered)
- A1: 不是每个 workflow 都会升格为 agent（risk: low）
- A2: `AgentDefinition` 只能引用已发布的 `WorkflowTemplateVersion`（risk: low）
- A3: activate/suspend/retire 属于 control-plane 治理动作，不属于 publish（risk: low）
- A4: manual/message/schedule/webhook/event 触发最终都应归一到统一 trigger contract（risk: medium）

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | workflow 与 agent 的关系 | 每个 workflow 都是 agent vs 仅部分升格 | 仅满足长期触发/独立调用条件时升格 | 设计记录与母任务一致 | 冻结升格准则 |
| C2 | activate 的含义 | publish 即可运行 vs 单独治理动作 | `activate` 独立于 `publish` | `T-013` 已冻结风险分层 | 冻结生命周期 |
| C3 | trigger owner | runtime 直接持有 vs control plane + trigger service | control plane 管配置，runtime 消费触发结果 | 与 `T-012` 一致 | 冻结 ownership |
| C4 | template version 与 agent 的关系 | `1:1` vs `1:N` | `1:N` | 需要承载不同身份、触发和授权组合 | 冻结 relationship |
| C5 | 哪些 trigger 必须依赖 agent | 所有触发都必须 agent vs 仅长期触发需要 | `schedule/webhook/event_subscription` 必须依赖 active agent；`manual/message` 可直接触发 template/version | 避免所有 workflow 默认常驻化 | 冻结 trigger split |
| C6 | 激活状态机命名 | `reviewable/activatable` vs `validated/approved` | `draft/validated/approved/active/suspended/retired/archived` | 更清楚区分配置有效性、治理批准与运行态 | 冻结 lifecycle naming |

## Scope and impact
- Affected areas/modules:
  - future `/v1/agents`
  - future trigger config / scheduler
  - future control-console agent management views
- External interfaces/APIs:
  - `POST /v1/agents`
  - `POST /v1/agents/{agentId}/activate`
  - `POST /v1/agents/{agentId}/suspend`
  - `POST /v1/agents/{agentId}/retire`
- Data/storage impact:
  - 需要冻结 `AgentDefinition`, `TriggerSpec`, `TriggerBinding` 等对象边界
- Backward compatibility:
  - 不影响 `/v0`
  - 不要求首期所有 workflow 都支持长期触发

## Phases
1. **Phase 1**: object and lifecycle freeze
   - Deliverable: `AgentDefinition` 与状态机
   - Acceptance criteria: 不再争论 agent 是否等于 workflow
2. **Phase 2**: trigger boundary freeze
   - Deliverable: trigger 类型、owner、handoff
   - Acceptance criteria: 不再争论 schedule/webhook/event 由谁管理
3. **Phase 3**: activation governance freeze
   - Deliverable: publish vs activate/suspend/retire 分层
   - Acceptance criteria: 不再争论长期触发能力如何被治理

## Verification and acceptance criteria
- Automated checks:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Manual checks:
  - 文档明确回答为什么不是每个 workflow 都成为 agent
  - 文档明确回答 `activate` 与 `publish` 的区别
  - 文档明确回答 trigger 的 owner 和 handoff
- Acceptance criteria:
  - 后续实现者不再需要决定 `AgentDefinition` 的存在理由、生命周期和触发边界

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| 把每个 workflow 自动升格为 agent | medium | high | 将升格条件写成硬准则 | 文档默认所有 workflow 都可长期触发 | 回退到 opt-in agent model |
| 让 runtime 直接持有 trigger 配置与治理 | medium | high | 固定 control-plane ownership | 文档把 trigger config 写进 runtime state | 回退到 trigger handoff 模型 |
| 把 activate 与 publish 混成一个动作 | medium | high | 延续 `T-013` 的风险分层 | 文档只保留 publish | 回退为独立 activation lifecycle |

## To-dos
- [x] Freeze `AgentDefinition` lifecycle
- [x] Freeze trigger ownership and classes
- [x] Freeze activate/suspend/retire governance
- [x] Register the subtask in project governance
