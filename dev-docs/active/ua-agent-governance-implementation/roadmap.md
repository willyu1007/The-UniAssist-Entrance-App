# Agent Governance Implementation — Roadmap

## Goal
- 交付 `T-011 / B5` 的完整 agent governance 闭环：control-plane objects、governance approval、trigger runtime 与 policy helpers 一起落地。

## Input sources
| Source | Path/reference | Used for |
|---|---|---|
| Parent roadmap | `dev-docs/active/ua-openclaw-collab-platform/roadmap.md` | B5 tranche scope / landing |
| Agent lifecycle design | `dev-docs/active/ua-agent-lifecycle-and-trigger-design/02-architecture.md` | agent/trigger semantics |
| Governance design | `dev-docs/active/ua-policy-secret-scope-governance-design/02-architecture.md` | policy/secret/scope object inventory |
| Design record | `/Users/phoenix/Downloads/team-openclaw-collab-workflow-design-record-v0.2.md` | long-term target shape and trigger-scheduler role |

## Execution scope
- `workflow-platform-api`
- `trigger-scheduler`
- `policy-sdk`
- `workflow-contracts`
- `prisma/schema.prisma`

## Acceptance
- `schedule + direct webhook` 触发真正可运行
- governance approval 与 runtime approval 语义分层清晰
- B5 objects/DTO/API 可直接供后续 control-console 接入
