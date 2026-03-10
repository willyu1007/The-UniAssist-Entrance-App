# 05 Pitfalls (do not repeat)

This file exists to prevent repeating mistakes within this task.

## Do-not-repeat summary (keep current)
- 不要把 connector 直接塞回 provider/executor 兼容体系。
- 不要让 event bridge 拥有 workflow 状态机。
- 不要把 browser fallback 当成默认集成方式。
- 不要过早把 connector-backed action 与 platform-native action 强行并到同一个 catalog。
- 不要在未冻结 ownership 前先争论 webhook-first 还是 poll-first。

## Pitfall log (append-only)

### 2026-03-10 - 外部能力一进来，最容易把边界重新打乱
- Symptom:
  - 一旦开始讨论外部系统，connector、action、provider、executor、adapter 这些词会迅速混在一起。
- Context:
  - 当前 repo 里已有 provider-plan 和 adapter-wechat，天然会让人倾向于沿用旧词扩展。
- What we tried:
  - 先回到 `T-012` 的服务边界，再单独定义 connector/action/event bridge/browser fallback 的责任。
- Why it failed (or current hypothesis):
  - 如果先从“怎么接 GitHub/Jira”开始，会默认沿着现有 provider 思路堆兼容逻辑。
- Fix / workaround (if any):
  - 明确 connector 是治理与绑定层，action 是 capability unit，event bridge 是归一化桥，browser 只是 fallback。
- Prevention (how to avoid repeating it):
  - 后续任何外部集成设计如果没有先回答这四者的边界，就不应进入实现阶段。
- References (paths/commands/log keywords):
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md`
