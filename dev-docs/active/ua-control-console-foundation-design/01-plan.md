# 01 Plan

## Phases
1. Stack and route freeze
2. Page and view-model freeze
3. Studio scope freeze
4. Handoff freeze

## Detailed steps
- 冻结技术栈：
  - `React + Vite + TypeScript`
  - `TanStack Router`
  - `TanStack Query`
- 冻结查询边界：
  - 统一走 `workflow-platform-api`
  - 不直连 runtime/DB/Convex
- 冻结首批页面：
  - `Runboard`
  - `Approval Inbox`
  - `Draft Inspector`
  - `Workflow Studio`
- 冻结 Studio 范围：
  - spec-first
  - conversational intake
  - mixed editing
  - read-only DAG preview

## Risks & mitigations
- Risk:
  - 技术栈只停留在“React + Vite”，没有给出路由和数据层策略
  - Mitigation:
    - 在 `02-architecture.md` 中冻结 route/query 建议
- Risk:
  - 控制台 scope 继续膨胀到 artifact explorer、registry、policy 全量控制面
  - Mitigation:
    - 明确首批只有四个主区，其余后置
- Risk:
  - UI 决策脱离正式对象模型
  - Mitigation:
    - 强制每个页面都写出依赖的 authoritative sources
