# 05 Pitfalls (do not repeat)

This file exists to prevent repeating mistakes within this task.

## Do-not-repeat summary (keep current)
- 不要让 chat surface 和 control console 各自产生未注册的“本地正式草稿”。
- 不要把 `publish` 当成一切高风险动作的总称。
- 不要让 recipe draft 脱离 run/evidence lineage。
- 不要在已发布的 draft line 上继续改写内容。
- 不要在首版就把 Builder 强行做成 git-style draft branching 系统。
- 不要在首版引入复杂的 merge/conflict 协作语义。

## Pitfall log (append-only)

### 2026-03-10 - Builder 很容易被实现成“聊天体验增强”而不是控制面对象
- Symptom:
  - 讨论 Builder 时，最自然的路径是继续沿着聊天消息和前端草稿缓存扩展。
- Context:
  - 当前 repo 的用户交互中心仍是 chat/timeline。
- What we tried:
  - 先把 Builder 问题重述为“draft SoT、revision、risk gating、recipe lineage”问题，而不是 UI 入口问题。
- Why it failed (or current hypothesis):
  - 如果先从 UI 切入，会默认把事实源落在前端会话态里。
- Fix / workaround (if any):
  - 明确 `WorkflowDraft` / `RecipeDraft` 都是 control-plane objects，由 `workflow-platform-api` 统一承接。
- Prevention (how to avoid repeating it):
  - 后续任何 Builder 设计如果没有 draft object、revision 和 governance matrix，就还不算进入实现阶段。
- References (paths/commands/log keywords):
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-workflow-core-skeleton-design/02-architecture.md`
  - `dev-docs/active/ua-workflow-data-plane-design/02-architecture.md`
