# Policy Secret Scope Governance Design — Roadmap

## Goal
- 冻结 `policy / secret / scope / privileged binding` 的正式治理边界，补齐协作型 OpenClaw 的控制面治理核心。

## Planning-mode context and merge policy
- Runtime mode signal: Default
- User confirmation when signal is unknown: not-needed
- Host plan artifact path(s): (none)
- Requirements baseline:
  - `/Users/phoenix/Downloads/team-openclaw-collab-workflow-design-record-v0.2.md`
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-builder-draft-sot-design/02-architecture.md`
  - `dev-docs/active/ua-connector-action-layer-design/02-architecture.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > parent task docs > design record > model inference
- Repository SSOT output: `dev-docs/active/ua-policy-secret-scope-governance-design/roadmap.md`
- Mode fallback used: non-Plan default applied: yes

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| Requirements doc | `/Users/phoenix/Downloads/team-openclaw-collab-workflow-design-record-v0.2.md` | policy/secret/scope 主治理需求 | high | 当前未独立承接 |
| Parent roadmap | `dev-docs/active/ua-openclaw-collab-platform/roadmap.md` | 阶段位置与 non-goals | high | `T-011` 母任务 |
| Builder draft design | `dev-docs/active/ua-builder-draft-sot-design/02-architecture.md` | publish/activate/bind/schedule/external write 风险矩阵 | high | 直接依赖 |
| Connector action design | `dev-docs/active/ua-connector-action-layer-design/02-architecture.md` | connector binding / secret ref / allow-deny owner | high | 直接依赖 |

## Non-goals
- 不实现 secret manager / vault / KMS
- 不实现 policy GUI
- 不定义具体 connector 权限集
- 不实现审批流引擎代码

## Open questions and assumptions
### Open questions (answer before implementation)
- Q1: policy 首版是统一 `GovernancePolicy` 外壳，还是 approval/invoke/delivery 各自独立对象？
- Q2: secret ref 是否按 workspace 统一治理，还是允许 project/environment overlay？

### Assumptions (if unanswered)
- A1: 高风险动作必须进入显式 governance request，而不是仅靠 UI 权限控制（risk: low）
- A2: runtime 只消费已批准 binding，不拥有 secret/policy registry（risk: low）
- A3: scope grant 必须可审计、可撤销、可过期（risk: low）

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | publish 与高风险动作 | 统一发布 vs 分层治理 | 分层治理 | `T-013` 已冻结 | 承接为正式治理模型 |
| C2 | secret owner | runtime/connector 持有 vs control-plane 收口 | control-plane 收口 | 设计记录与 `T-014` 一致 | 冻结 ownership |
| C3 | scope 语义 | 弱权限标签 vs 可撤销 grant | 可审计 grant | 团队协作场景需要治理 | 冻结状态机 |
| C4 | 审批对象是否独立重建 | `GovernanceRequest`/`GovernanceDecision` 独立建账 vs 复用 `ApprovalRequest`/`ApprovalDecision` | 复用 `ApprovalRequest`/`ApprovalDecision` 作为唯一正式审批账本 | 避免与 `T-018` data plane 冲突 | 冻结 approval authority |
| C5 | policy 首版建模 | 多类专属 policy objects vs 统一外壳 | 统一 `PolicyBinding` 外壳，按 `policy_kind` 区分 | 先冻结治理语义，不把 DSL/表结构做爆 | 冻结 policy shell |
| C6 | secret ref 主权层级 | 纯 workspace vs project-only vs environment overlay | workspace 主权 + environment overlay | 更符合协作治理与环境隔离需要 | 冻结 secret model |

## Scope and impact
- Affected areas/modules:
  - future policy layer
  - future secret binding layer
  - agent activation / connector binding / schedule enablement
- External interfaces/APIs:
  - privileged action request / approve / reject
  - secret binding request
  - scope grant / revoke
- Data/storage impact:
  - 需要冻结 governance request / decision / grant / ref 对象边界
- Backward compatibility:
  - `/v0` 不直接暴露治理对象

## Phases
1. **Phase 1**: governance object freeze
2. **Phase 2**: risk action and approval freeze
3. **Phase 3**: secret/scope ownership freeze

## Verification and acceptance criteria
- Automated checks:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Manual checks:
  - 文档明确回答谁拥有 secret/policy/scope 主权
  - 文档明确回答哪些动作需要 governance request
  - 文档明确回答 runtime/connector 只拿到什么级别的授权结果
- Acceptance criteria:
  - 不再需要实现者决定 secret/policy/scope 是不是分散在各个 runtime/connector 内部

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| secret/policy 继续散落在各执行体内部 | medium | high | 固定 control-plane ownership | 文档让 runtime 直接拥有 secret binding | 回退到 centralized governance |
| 风险动作只靠 UI 权限，没有正式 request/decision | medium | high | 冻结 governance request 模型 | 文档缺少可审计审批对象 | 回退到 explicit governance request |

## To-dos
- [x] Freeze governance object inventory
- [x] Freeze privileged action matrix
- [x] Freeze secret/scope ownership model
- [x] Register the subtask in project governance
