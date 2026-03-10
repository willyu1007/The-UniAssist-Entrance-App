# 03 Implementation Notes

## Current state
- This subtask is design-only.
- No teaching workflow template, parser, agent executor, or delivery integration has been started in this task.

## Initial decisions
- 本子包直接依赖 `T-018` 的 artifact/actor/delivery 边界与 `T-013` 的 recipe draft 模型。
- 首条教学 workflow 固定为：`上传 -> 解析接口 -> 个性化评估 agent -> 教师审核 -> fan-out 交付`。
- agent 的正式输出必须至少收敛为 `AssessmentDraft`, `EvidencePack`, `ReviewableDelivery`, `AnalysisRecipe draft`。
- `AssessmentDraft` 使用平台通用的 `subject_ref` / `subject_type` 作为评估锚点，而不是把 learner/group 写死成平台基准。
- `ReviewableDelivery` 使用平台通用的 `presentation_ref` 作为呈现锚点，而不是把 teacher/parent/student 视图写死成平台基准。
- parser 仅定义接口和输出契约，不展开内部实现。
- 临时团队成员必须先确认 membership，才能成为 approver 或 delivery target。

## Deferred decisions
- 教学场景下 `subject_type` 与 `presentation_ref` 的推荐值命名
- 具体 delivery channel 实现
- parser quality scoring 的字段级 schema

## Follow-up TODOs
- 用本子包结果支撑后续 teaching implementation task
- 用本子包结果支撑 `ua-control-console-foundation-design` 中的 run/approval/delivery views
- 在 teaching implementation 中补 `subject_type` 与 `presentation_ref` 的场景推荐值命名
- 在 Builder 侧补 recipe draft capture 的 UX 入口
