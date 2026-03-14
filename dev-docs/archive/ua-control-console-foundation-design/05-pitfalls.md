# 05 Pitfalls (do not repeat)

This file exists to prevent repeating mistakes within this task.

## Do-not-repeat summary (keep current)
- 不要把控制台做成 Expo 聊天面的一个“高级页面”。
- 不要让控制台直连 runtime、DB 或 Convex。
- 不要把 Workflow Studio 提前做成画布式编辑器。
- 不要过早把 `Artifact Explorer` 升成独立主区或把 `revision compare` 做成复杂 merge 系统。

## Pitfall log (append-only)

### 2026-03-10 - 控制台复杂度高时，最容易错误地把前端框架当后端边界
- Symptom:
  - 讨论控制台技术栈时，很容易因为功能复杂就默认转向 SSR/BFF 方案。
- Context:
  - 当前系统已经计划新增独立的 `workflow-platform-api`，而控制台的首要问题是治理视图和状态管理，不是 SSR。
- What we tried:
  - 先把“技术栈选择”拆成 query ownership、route grouping、first-page priority 和 Studio scope 四个问题。
- Why it failed (or current hypothesis):
  - 如果不先冻结这些边界，技术栈会替代产品/架构决策本身。
- Fix / workaround (if any):
  - 明确控制台走 `React + Vite + TypeScript`，并统一通过 `workflow-platform-api` 获取数据。
- Prevention (how to avoid repeating it):
  - 后续控制台实现任务如果开始讨论直连 DB、SSR-first 或画布-first，应先回到本子包的 query 和 scope 决策。
- References (paths/commands/log keywords):
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md`
  - `dev-docs/active/ua-builder-draft-sot-design/02-architecture.md`
