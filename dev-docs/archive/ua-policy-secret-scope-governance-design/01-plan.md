# 01 Plan

## Phases
1. governance object freeze
2. privileged action freeze
3. secret and scope ownership freeze

## Detailed steps
- 承接 `T-013` 的 publish/activate/bind/schedule/external write 风险矩阵
- 定义 governance request / decision / grant / ref 的最小对象集
- 冻结 secret 与 scope 的 owner、审批、撤销和过期语义
- 明确 runtime、connector、external runtime 只能消费什么级别的授权结果

## Dependencies
- Direct:
  - `T-011 / ua-openclaw-collab-platform`
  - `T-013 / ua-builder-draft-sot-design`
  - `T-014 / ua-connector-action-layer-design`
- Related:
  - `ua-agent-lifecycle-and-trigger-design`
  - `ua-external-runtime-bridge-design`

## Acceptance criteria
- 不再需要实现者决定高风险动作由 UI、runtime 还是 control plane 审批
- 不再需要实现者决定 secret ref 是否直接下放到执行体内部
- 不再需要实现者决定 scope grant 是否可审计/可撤销
