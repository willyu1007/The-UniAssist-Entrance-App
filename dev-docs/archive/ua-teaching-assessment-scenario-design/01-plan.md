# 01 Plan

## Phases
1. Scenario flow freeze
2. Convergence contract freeze
3. Review and fan-out freeze
4. Handoff freeze

## Detailed steps
- 冻结流程节点：
  - 材料上传
  - 解析接口
  - 个性化评估 agentic node
  - 教师审核
  - 多受众 fan-out
- 冻结收敛对象：
  - `AssessmentDraft`
  - `EvidencePack`
  - `ReviewableDelivery`
  - `AnalysisRecipe draft`
- 冻结参与者规则：
  - teacher owner / approver
  - workspace collaborators
  - temporary collaborators
  - parent / student / group audience
- 冻结非目标：
  - parse internals
  - prompt internals
  - channel implementation

## Risks & mitigations
- Risk:
  - 讨论偏到 parser 实现或 prompt 细节
  - Mitigation:
    - 本子包只保留接口、artifact shape 和 handoff boundary
- Risk:
  - agent 输出仍然是自由文本，没有结构化收敛
  - Mitigation:
    - 强制把四类收敛对象写进流程主线
- Risk:
  - team 和 audience 规则没有落到 delivery contract
  - Mitigation:
    - 强制在架构文档中写成员确认和受众解析规则
