# Teaching Assessment Scenario Design — Roadmap

## Goal
- 冻结教学首条 workflow 的流程、收敛合同、团队与受众规则，使其成为验证平台骨架、数据面、Builder 和控制台的首个真实场景。

## Planning-mode context and merge policy
- Runtime mode signal: Default
- User confirmation when signal is unknown: not-needed
- Host plan artifact path(s): (none)
- Requirements baseline:
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-workflow-data-plane-design/02-architecture.md`
  - `dev-docs/active/ua-builder-draft-sot-design/02-architecture.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > parent task docs > model inference
- Repository SSOT output: `dev-docs/active/ua-teaching-assessment-scenario-design/roadmap.md`
- Mode fallback used: non-Plan default applied: yes

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| User-confirmed instructions | Current chat request | 教学场景优先、探索型个性化评估 agent 收敛、fan-out 交付 | highest | 明确不是 parser 深实现任务 |
| Parent roadmap | `dev-docs/active/ua-openclaw-collab-platform/roadmap.md` | 场景目标、阶段位置、非目标 | high | `T-011` 为母任务 |
| Data plane design | `dev-docs/active/ua-workflow-data-plane-design/02-architecture.md` | artifact/actor/delivery 边界 | high | `T-018` 为直接依赖 |
| Builder draft design | `dev-docs/active/ua-builder-draft-sot-design/02-architecture.md` | recipe draft 和治理边界 | high | `T-013` 为直接依赖 |
| Model inference | N/A | 流程压缩、交付视图拆分 | lowest | 不覆盖已确认约束 |

## Non-goals
- 不实现 parser、prompt、评估模型或外发 channel adapter
- 不定义完整教学产品信息架构
- 不设计所有学科/年级的 rubric 变体
- 不引入 GitHub/Jira/CI 等外部 connector 复杂度

## Open questions and assumptions
### Open questions (answer before execution)
- Q1: `AssessmentDraft` 是否需要强制包含平台通用的 `subject_ref` / `subject_type`？
- Q2: `ReviewableDelivery` 是否需要包含平台通用的 `presentation_ref`？

### Assumptions (if unanswered)
- A1: 首条 workflow 固定为 `上传 -> 解析接口 -> 个性化评估 agent -> 教师审核 -> fan-out 交付`（risk: low）
- A2: agent 的正式输出必须至少收敛为 `AssessmentDraft + EvidencePack + ReviewableDelivery + AnalysisRecipe draft`（risk: low）
- A3: parser 只定义输入输出契约，不在本子包展开深实现（risk: low）
- A4: 临时团队成员必须确认后才能成为有效 approver 或 delivery target（risk: low）

## Platform/scenario boundary
- 教学场景只是首个验证样本，不反向定义平台基准对象。
- `AssessmentDraft` 使用平台通用评估锚点：
  - `subject_ref`
  - `subject_type`
- `ReviewableDelivery` 使用平台通用呈现锚点：
  - `presentation_ref`
- 教学场景可以把这些通用字段映射到 learner、group、teacher internal、parent summary、student feedback 等具体语义，但这些具体语义不应上升为平台默认基线。

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | 首条场景流程 | 线性材料处理 vs 加入探索型评估 agent | 必须包含 agent 收敛链路 | 用户已确认 | 在本子包冻结 artifact contract |
| C2 | 交付方式 | 审核前可直发 vs 必须 review 后 fan-out | 必须先 review 再交付 | 用户已确认 | 在本子包冻结 delivery gate |
| C3 | 团队模型 | 只支持 workspace 成员 vs 支持临时团队 | 采用混合模型，临时成员需确认 | 用户已确认 | 在本子包冻结 actor / audience 规则 |
| C4 | parser 深度 | 深入实现 vs 只定义契约 | 只定义接口与输出契约 | 用户已确认 | 避免本子包变成实现设计 |

## Scope and impact
- Affected areas/modules:
  - future workflow template / version definitions
  - future teaching-specific executors or parse adapters
  - future control-console run/approval views
- External interfaces/APIs:
  - parse adapter contract
  - assessment agent node input/output artifact contract
  - delivery/audience resolution contract
- Data/storage impact:
  - 依赖 `Artifact`, `Approval*`, `Actor*`, `AudienceSelector`, `Delivery*`
  - 依赖 `RecipeDraft` lineage
- Backward compatibility:
  - 场景在 `/v0` 下仍可投影为 timeline/task_state/task_question

## Phases
1. **Phase 1**: scenario flow freeze
   - Deliverable: 首条 workflow 的端到端流程
   - Acceptance criteria: 不再争论 agent 是否在场景内
2. **Phase 2**: convergence contract freeze
   - Deliverable: `AssessmentDraft`, `EvidencePack`, `ReviewableDelivery`, `AnalysisRecipe draft`
   - Acceptance criteria: agent 输出不再停留在聊天文本
3. **Phase 3**: review and fan-out freeze
   - Deliverable: review gate、team confirmation、audience resolution、fan-out 规则
   - Acceptance criteria: 不再争论交付前是否必须 review

## Verification and acceptance criteria
- Automated checks:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Manual checks:
  - 文档明确给出端到端流程和节点责任
  - 文档明确给出四类收敛对象及其关系
  - 文档明确给出 team confirmation / audience / fan-out 规则
- Acceptance criteria:
  - 实现者不再需要决定 agent 如何收敛、交付前是否 review、fan-out 如何做
  - 场景可以直接作为后续实现任务的验收基线

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| 场景退化成线性 ETL，不再验证 agent 收敛 | medium | high | 将四类收敛对象写成硬产出 | 文档只有上传/解析/交付，没有 evidence/recipe | 回退并补齐 convergence contract |
| 交付视图设计过深，提前绑定 UI 或 channel | medium | medium | 只冻结 artifact slots、audience 和 review gate | 文档开始设计具体页面或消息模版 | 收缩回 delivery contract |
| 临时团队规则缺失，审批与交付对象不清 | medium | medium | 明确 confirmation 是 actor membership 的前置条件 | 文档默认所有临时成员立即生效 | 回退为 pending confirmation gating |

## To-dos
- [ ] Freeze end-to-end teaching workflow
- [ ] Freeze convergence contract
- [ ] Freeze review / fan-out / team rules
- [ ] Register the subtask in project governance
