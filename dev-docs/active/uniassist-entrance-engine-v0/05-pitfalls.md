# 05 Pitfalls (do not repeat)

This file exists to prevent repeating mistakes within this task.

## Do-not-repeat summary (keep current)
- 在开始复杂实现前必须先补齐 `dev-docs` bundle 并记录验证路径，避免后续状态失真。

## Pitfall log (append-only)

### 2026-02-23 - Plan mode与技能可用性误判
- Symptom:
  - 规划阶段一度误判 `plan-maker` 不可用。
- Context:
  - 会话中出现临时技能清单与仓库真实技能清单不一致。
- What we tried:
  - 先按临时清单执行手工 roadmap。
- Why it failed (or current hypothesis):
  - 读取了不完整技能上下文，未先核实 `.codex/.ai` 目录真实可用技能。
- Fix / workaround (if any):
  - 回查仓库技能目录并按 `plan-maker` 模板重写 roadmap。
- Prevention (how to avoid repeating it):
  - 复杂任务前先核对本地 `SKILL.md` 实体存在性。
- References (paths/commands/log keywords):
  - `.codex/skills/workflows/planning/plan-maker/SKILL.md`
