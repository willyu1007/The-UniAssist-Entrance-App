# 05 Pitfalls (do not repeat)

This file exists to prevent repeating mistakes within this task.

## Do-not-repeat summary (keep current)
- 不要把 `TimelineEvent`、chat cards 或 runboard row model 当成 authoritative objects。
- 不要把 `actor graph` 一开始做成全量组织管理系统；只冻结 workflow 所需最小关系原语。
- 不要把 delivery 细节提前绑定到特定 connector/channel 实现。
- 不要把“自由 JSON”误解成“没有任何固定平台锚点字段”。
- 不要过早把 `relation_type` 锁死成狭窄业务枚举，导致跨场景复用困难。

## Pitfall log (append-only)

### 2026-03-10 - 容易把 projection convenience fields 误写成事实源
- Symptom:
  - 在讨论控制台和聊天兼容时，很容易直接围绕 timeline row 和 UI 卡片定义数据对象。
- Context:
  - 当前 repo 的事实感知主要来自 `timeline_events` 和 `/v0` 兼容协议。
- What we tried:
  - 先按“formal object / projection”二分法，要求每个对象先判断是否可重建。
- Why it failed (or current hypothesis):
  - 如果对象可由 formal events 或 authoritative objects 重建，它就不该拥有主数据职责。
- Fix / workaround (if any):
  - 明确把 `TimelineEvent`, `task_question`, `task_state`, runboard row 都归为 projection。
- Prevention (how to avoid repeating it):
  - 后续任何设计若以 UI row 或聊天事件为中心定义数据库表，必须先回到 authoritative object inventory 复核。
- References (paths/commands/log keywords):
  - `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md`
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
