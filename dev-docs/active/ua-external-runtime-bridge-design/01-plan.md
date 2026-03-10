# 01 Plan

## Phases
1. bridge role freeze
2. invoke and callback freeze
3. formal object ownership freeze

## Detailed steps
- 定义 bridge 与 platform API/runtime/worker 的角色关系
- 冻结 invoke、checkpoint、callback 的最小协议边界
- 明确外部 runtime 产出的状态、artifact、approval、delivery 如何回归平台

## Dependencies
- Direct:
  - `T-011 / ua-openclaw-collab-platform`
  - `T-012 / ua-workflow-core-skeleton-design`
  - `T-014 / ua-connector-action-layer-design`
- Related:
  - `ua-agent-lifecycle-and-trigger-design`
  - `ua-policy-secret-scope-governance-design`

## Acceptance criteria
- 不再需要实现者决定 bridge 是否拥有平台主权
- 不再需要实现者决定 callback 是否能直接修改 workflow state
- 不再需要实现者决定 formal artifact/approval 是平台记账还是外部 runtime 记账
