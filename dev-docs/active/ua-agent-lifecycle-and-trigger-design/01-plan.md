# 01 Plan

## Phases
1. object and lifecycle freeze
2. trigger boundary freeze
3. activation governance freeze

## Detailed steps
- 定义 `AgentDefinition` 与 `WorkflowTemplateVersion` 的关系
- 冻结升格条件，明确不是每个 workflow 都成为长期 agent
- 定义 trigger 类型与 ownership：manual/message/schedule/webhook/event
- 冻结 activate/suspend/retire 的治理边界

## Dependencies
- Direct:
  - `T-011 / ua-openclaw-collab-platform`
  - `T-012 / ua-workflow-core-skeleton-design`
  - `T-013 / ua-builder-draft-sot-design`
- Related:
  - `ua-policy-secret-scope-governance-design`
  - `ua-external-runtime-bridge-design`

## Acceptance criteria
- 实现者不再需要决定 `AgentDefinition` 是否存在
- 实现者不再需要决定 trigger config 是 control-plane object 还是 runtime state
- 实现者不再需要决定 `activate` 是否只是 `publish` 的别名
