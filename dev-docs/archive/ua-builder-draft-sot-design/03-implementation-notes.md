# 03 Implementation Notes

## Current state
- This subtask is design-only.
- No builder UI, control-plane schema, or API route implementation has been started in this task.

## Initial decisions
- 本子包直接依赖 `T-012` 的平台 API ownership 和 `T-018` 的 authoritative data-plane 边界。
- `WorkflowDraft` 与 `RecipeDraft` 都是 control-plane objects，不属于 UI 本地状态。
- `WorkflowDraft` 与 `RecipeDraft` 首版保持两个逻辑对象，不统一为单一 draft kind。
- chat surface 与 control console 都必须通过 `workflow-platform-api` 读写同一 draft SoT。
- 双入口采用“数据对称、能力与权限不对称”模型：
  - 数据对称：共用同一个 `WorkflowDraft` / `DraftRevision`
  - 能力与权限不对称：chat 偏 intake/light patch，console 偏 inspect/edit/validate/publish
- `DraftRevision` 首版采用 append-only revision log，不引入 merge/conflict resolution。
- `publish template` 与 `activate/bind/schedule/external write` 明确拆成不同风险动作。
- `publish` 会冻结当前 draft line 并产出 `WorkflowTemplateVersion`；后续编辑必须新开 draft line，不回写原已发布 line。
- 新 draft line 首版通过 `basedOnTemplateVersionRef` 挂靠到已发布版本，不引入 draft branching 优先模型。
- `RecipeDraft` 必须带有 run/evidence lineage，不能退化成自由文本笔记。

## Deferred decisions
- 具体 API route 命名
- `RecipeDraft` 与未来 `CompiledCapability` 的最终表关系
- 细粒度 RBAC/approver 规则

## Follow-up TODOs
- 用本子包结果支撑归档后的 `ua-teaching-assessment-scenario-design` 历史基线
- 用本子包结果支撑 `ua-control-console-foundation-design`
- 在后续评审中确认 historical sample 场景如何触发 `RecipeDraft` capture 与 review
- 在后续实现任务中落 schema 和 API DTO
