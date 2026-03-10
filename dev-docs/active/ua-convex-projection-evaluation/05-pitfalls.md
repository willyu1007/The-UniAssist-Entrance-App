# 05 Pitfalls (do not repeat)

This file exists to prevent repeating mistakes within this task.

## Do-not-repeat summary (keep current)
- 不要把 Convex 评估重新变成主数据库选型讨论。
- 不要在没有 read-model ownership 前讨论接入细节。
- 不要让“实时性”自动推翻平台的 authoritative store 边界。
- 不要让 control console 绕开 `workflow-platform-api` 直接把 Convex 当成主查询面。

## Pitfall log (append-only)

### 2026-03-10 - 一旦讨论实时协作，最容易把投影层误判成主数据面
- Symptom:
  - 围绕控制台实时性的讨论，很容易自然地滑向“那是否应该换成更实时的主后端”。
- Context:
  - 用户单独问过 Convex，但当前任务已经明确它不作为主数据面默认路线。
- What we tried:
  - 把评估问题压缩成三个判断：候选 read model、同步原则、go/no-go/exit criteria。
- Why it failed (or current hypothesis):
  - 如果不先写死 authoritative store 不变，评估任务会吞掉主线架构决策。
- Fix / workaround (if any):
  - 明确 Convex 只评估 projection/read-model 场景。
- Prevention (how to avoid repeating it):
  - 后续任何讨论若要求 Convex 持有 authoritative writes，应直接视为超出本子包范围并回到母任务重新决策。
- References (paths/commands/log keywords):
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-workflow-data-plane-design/02-architecture.md`
  - `dev-docs/active/ua-control-console-foundation-design/02-architecture.md`
