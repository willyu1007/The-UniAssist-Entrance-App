# 05 Pitfalls (do not repeat)

This file exists to prevent repeating mistakes within this task.

## Do-not-repeat summary (keep current)
- 不要把 `workflow-runtime` 直接做成新的大 gateway；它拥有状态机，不拥有 `/v0` 兼容投影。
- 不要把 `worker` 设计成第二个 runtime；它执行 continuation protocol，但不决定业务状态转换。
- 不要在 `P1` 把 `AgentDefinition`、trigger、connector 一起塞进骨架冻结范围。

## Pitfall log (append-only)

### 2026-03-10 - 入口兼容层与正式运行时边界容易重叠
- Symptom:
  - 讨论中很容易把 `/v0` gateway 的兼容职责和新 runtime 的正式职责混成一层。
- Context:
  - 当前 repo 中 gateway 已经同时持有入口、路由、timeline、provider invoke 等能力。
- What we tried:
  - 先从 run 启动入口、timeline 投影归属、continuation 所有权三个高影响问题下手冻结边界。
- Why it failed (or current hypothesis):
  - 如果不先拆清“formal event”和“compatibility projection”，设计会回到 ingress-centric 模型。
- Fix / workaround (if any):
  - 强制规定 runtime 只产出 formal events，`ingress-gateway` 负责 `/v0` 投影。
- Prevention (how to avoid repeating it):
  - 后续任何子包设计，如果让 runtime 直接拥有 chat/timeline 兼容事件，视为越界。
- References (paths/commands/log keywords):
  - `apps/gateway/src/server.ts`
  - `apps/worker/src/worker.ts`
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
