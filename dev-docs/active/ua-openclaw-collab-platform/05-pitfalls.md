# 05 Pitfalls (do not repeat)

This file exists to prevent repeating mistakes within this task.

## Do-not-repeat summary (keep current)
- 不要把“升级成全面 monorepo”误解成“先做目录改名”；真正的主线是系统中心和平台层级迁移。
- 不要让探索型 agent 直接输出聊天文本作为正式结果；必须收敛成 artifact + reviewable delivery。
- 不要在对象模型未冻结前把 Convex 当成主数据面改造方向。
- 不要把首个教学验证样本误写成平台默认基线。

## Pitfall log (append-only)

### 2026-03-10 - 把 monorepo 形态误当成主目标
- Symptom:
  - 讨论一开始容易把重点放在目录树和仓库命名上，而不是正式对象和升级节奏。
- Context:
  - 当前仓库已经是 `apps/* + packages/*` 的 monorepo。
- What we tried:
  - 回查 repo 实际结构、`pnpm-workspace.yaml`、gateway/contracts/prisma 现状。
- Why it failed (or current hypothesis):
  - “全面 monorepo”这个表述容易掩盖真正的架构升级目标。
- Fix / workaround (if any):
  - 在 roadmap 中明确主目标是 workflow/control/runtime/data plane 升级，而不是单纯仓库整理。
- Prevention (how to avoid repeating it):
  - 后续所有讨论都先回答“系统中心和正式对象有没有变化”，再讨论目录和命名。
- References (paths/commands/log keywords):
  - `pnpm-workspace.yaml`
  - `apps/gateway/src/server.ts`
  - `prisma/schema.prisma`

### 2026-03-11 - 把设计子包收口误当成可以任意开 implementation
- Symptom:
  - 当 `T-012/T-018/T-013/T-017/T-015/T-014/T-016` 都已收口后，容易直接跳去做控制台或 connector，而不是先落实 platform foundation。
- Context:
  - 设计闭环完成并不等于实现顺序可以随意打乱；底层 authoritative objects、draft SoT 和查询边界仍然有明确先后依赖。
- What we tried:
  - 回看总包、子包之间的依赖与已经冻结的 admission criteria。
- Why it failed (or current hypothesis):
  - 如果后置 tranche 先落地，会反向定义 API、对象和 projection 边界，导致返工。
- Fix / workaround (if any):
  - 在总包里显式固定 `I1 -> I2 -> I3 -> I4` 的 tranche 顺序，并要求 implementation task 逐 tranche 开包。
- Prevention (how to avoid repeating it):
  - 后续任何 implementation 讨论都先回答“它属于哪一个 tranche，是否满足 admission criteria”，再决定是否开任务。
- References (paths/commands/log keywords):
  - `dev-docs/active/ua-openclaw-collab-platform/01-plan.md`
  - `dev-docs/active/ua-openclaw-collab-platform/02-architecture.md`

### 2026-03-11 - 总包把子包当“已冻结基线”，但子包状态和 canonical 语义没有同步
- Symptom:
  - 总包已经把 `T-012 / T-018` 当成已冻结基线，但子包仍停留在 `planned`；同时 `T-021` 一度引入了与 `T-018` 冲突的 `ApprovalRequestStatus`。
- Context:
  - 多轮子包收敛后，如果不回头做总包级审计，状态漂移和语义冲突会被总包摘要掩盖。
- What we tried:
  - 对 `T-011 -> T-022` 做总包级状态与语义复核，核对子包 `.ai-task.yaml`、`00-overview.md`、canonical object/status 定义。
- Why it failed (or current hypothesis):
  - 子包是分批收敛的，总包先被更新，导致“总包结论”与“子包状态/语义”短暂脱节。
- Fix / workaround (if any):
  - 将 `T-012 / T-018` 状态推进到 `in-progress`，并让 `T-021` 严格复用 `T-018` 的 `ApprovalRequestStatus`。
- Prevention (how to avoid repeating it):
  - 每完成一轮子包批量收敛后，都必须回到总包做一次状态和 canonical 语义审计，再决定是否宣布“规划层已完整覆盖”。
- References (paths/commands/log keywords):
  - `dev-docs/active/ua-openclaw-collab-platform/00-overview.md`
  - `dev-docs/active/ua-policy-secret-scope-governance-design/02-architecture.md`
  - `dev-docs/active/ua-workflow-data-plane-design/02-architecture.md`

### 2026-03-11 - 把 tranche 当成 implementation bundle，导致开包单位过粗
- Symptom:
  - 总包已经有 `I1-I4` 分期，但如果直接按 tranche 开任务，实施包会变成“阶段名”，而不是可落到 repo 的真实变更单元。
- Context:
  - 完整 `T-011` 同时覆盖 platform foundation、draft/publish、控制台、agent/governance、connector、external runtime bridge、验证场景与 Convex 实验。
- What we tried:
  - 先从 `I1-I4` 回推实现单元，再按 repo landing、依赖闭环和语义边界重组 implementation bundle。
- Why it failed (or current hypothesis):
  - tranche 适合表达阶段顺序，不适合直接充当 implementation task 粒度；否则 `I3`、`I4` 这类阶段会把验证场景、控制台、治理、connector、bridge 混成一个实现包。
- Fix / workaround (if any):
  - 保留 `I1-I4` 作为阶段视图，同时新增 `B1-B9` 作为真正的 implementation bundle 结构。
- Prevention (how to avoid repeating it):
  - 后续讨论 implementation 时，先回答“它属于哪个 bundle”，再回答“它属于哪个 tranche”；不要直接拿 tranche 名称去开任务。
- References (paths/commands/log keywords):
  - `dev-docs/active/ua-openclaw-collab-platform/01-plan.md`
  - `dev-docs/active/ua-openclaw-collab-platform/02-architecture.md`
  - `dev-docs/active/ua-openclaw-collab-platform/03-implementation-notes.md`
