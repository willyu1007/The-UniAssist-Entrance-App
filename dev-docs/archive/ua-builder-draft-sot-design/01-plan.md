# 01 Plan

## Phases
1. Draft inventory and lifecycle freeze
2. Dual-entry command model freeze
3. Governance and promotion freeze
4. Handoff freeze

## Detailed steps
- 冻结 draft 对象：
  - `WorkflowDraft`
  - `DraftRevision`
  - `RecipeDraft`
  - `DraftSource`
- 冻结双入口：
  - chat surface 发起/续写 builder
  - control console 查看/编辑/校验同一 draft
  - platform API 作为唯一写入口
- 冻结治理动作：
  - `publish template`
  - `activate capability`
  - `bind secret/connector`
  - `enable schedule`
  - `allow external write`
- 冻结 recipe 路径：
  - 从 run/evidence 形成 `RecipeDraft`
  - 人工审核后晋升

## Risks & mitigations
- Risk:
  - Draft lifecycle 只写状态名，不写入口和 owner
  - Mitigation:
    - 在 `02-architecture.md` 中明确 command owner 和 state transitions
- Risk:
  - 把 Studio 编辑态和 draft 事实源混成一层
  - Mitigation:
    - 显式区分 UI session state 与 control-plane draft object
- Risk:
  - “人人可发布”被误读为“人人可激活高风险能力”
  - Mitigation:
    - 用分层治理矩阵写清 publish 与 activation/binding 的区别
