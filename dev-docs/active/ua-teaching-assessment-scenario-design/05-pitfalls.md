# 05 Pitfalls (do not repeat)

This file exists to prevent repeating mistakes within this task.

## Do-not-repeat summary (keep current)
- 不要把教学场景简化成“上传材料后自动出结果”的线性流程。
- 不要让个性化评估 agent 的正式输出停留在自由文本。
- 不要把 parser 实现或 channel 实现拖进本子包。
- 不要把 learner/group/teacher/parent 这类教学字段回写成平台默认基线。

## Pitfall log (append-only)

### 2026-03-10 - 容易把教学场景做成业务 demo，而不是平台验证样本
- Symptom:
  - 场景讨论很容易围绕“教学业务上想看到什么结果”，而忽略平台层的收敛、review、fan-out 原语。
- Context:
  - 用户明确要求教学场景不仅要验证基础组件，还要验证探索型 agent 的收敛过程。
- What we tried:
  - 把场景拆成流程、四类收敛对象、team/audience 规则三层，而不是只描述业务故事。
- Why it failed (or current hypothesis):
  - 如果没有 formal object contract，场景很快会退化成 prompt demo 或 ad-hoc 业务逻辑。
- Fix / workaround (if any):
  - 强制要求 `AssessmentDraft`, `EvidencePack`, `ReviewableDelivery`, `AnalysisRecipe draft` 成为硬产出。
- Prevention (how to avoid repeating it):
  - 后续任何 teaching 实现任务，如果不能产出这四类对象并通过 review gate，就不算满足本子包要求。
- References (paths/commands/log keywords):
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-workflow-data-plane-design/02-architecture.md`
  - `dev-docs/active/ua-builder-draft-sot-design/02-architecture.md`
