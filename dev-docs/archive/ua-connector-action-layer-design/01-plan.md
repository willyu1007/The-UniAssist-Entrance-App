# 01 Plan

## Phases
1. Definition freeze
2. Governance freeze
3. Interaction freeze
4. Handoff freeze

## Detailed steps
- 冻结定义：
  - `ConnectorDefinition`
  - `ConnectorBinding`
  - `ActionDefinition`
  - `EventBridge`
  - `BrowserFallbackProfile`
- 冻结治理：
  - secret refs
  - auth refresh
  - policy binding
  - approval requirements
- 冻结交互：
  - platform API command/query ownership
  - runtime invocation shape
  - worker 参与的异步恢复/投递边界

## Risks & mitigations
- Risk:
  - connector 被直接并回 provider/executor 体系
  - Mitigation:
    - 在架构文档中强制写出“responsible / not responsible”矩阵
- Risk:
  - action 与 workflow node 混淆
  - Mitigation:
    - 把 action 定义成 external capability unit，不是 orchestration unit
- Risk:
  - browser fallback 侵入主集成路径
  - Mitigation:
    - 明确 browser fallback 只在无可靠 API 时启用
