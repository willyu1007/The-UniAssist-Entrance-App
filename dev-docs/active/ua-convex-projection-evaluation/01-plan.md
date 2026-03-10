# 01 Plan

## Phases
1. Candidate read-model freeze
2. Sync/ownership freeze
3. Go/no-go rubric freeze
4. Handoff freeze

## Detailed steps
- 冻结候选 read models：
  - runboard snapshot/subscription
  - approval inbox subscription
  - draft activity feed
  - collaboration notifications
- 冻结同步原则：
  - authoritative writes remain in Postgres
  - commands remain in platform API
  - projection lag/failure does not corrupt authoritative state
- 冻结 go/no-go：
  - entry criteria
  - exit criteria
  - fallback if no-go

## Risks & mitigations
- Risk:
  - 候选范围过大，评估失去结论
  - Mitigation:
    - 限定为控制台和协作订阅 read models
- Risk:
  - 重新打开主数据库选型讨论
  - Mitigation:
    - 在架构文档中写死 authoritative store 不变
- Risk:
  - 没有 no-go 标准，后续继续摇摆
  - Mitigation:
    - 强制写出退出条件和 fallback 路径
