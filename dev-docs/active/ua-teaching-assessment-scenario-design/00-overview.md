# 00 Overview

## Status
- State: in-progress
- Status note: `T-017` 已完成平台通用字段与教学验证场景边界的纠偏，可作为后续 teaching implementation 与 control-console 场景引用基线；本子包仍不承接业务实现。
- Next step: 在此基线上继续细化 teaching implementation 所需的字段级 schema 和场景推荐值命名。

## Goal
建立一份 handoff-ready 的教学场景设计基线，明确个性化评估 agent 如何在 workflow 中受控探索、结构化收敛、经过教师审核，并向不同受众交付。

## Non-goals
- 不实现上传解析、模型调用、消息外发
- 不定义所有教学产品页面或运营流程
- 不做 parser、rubric、delivery template 的字段级实现
- 不设计 connector/action layer

## Context
- `T-011` 已明确教学场景是首个验证场景，且必须覆盖探索型个性化评估 agent 的收敛过程。
- `T-018` 已提供 artifact/actor/delivery 的 authoritative object 边界。
- `T-013` 已提供 `RecipeDraft` 的控制面对象与晋升路径。

## Acceptance criteria (high level)
- [x] 文档明确给出 `上传 -> 解析接口 -> 个性化评估 agent -> 教师审核 -> fan-out 交付`
- [x] 文档明确给出 `AssessmentDraft / EvidencePack / ReviewableDelivery / AnalysisRecipe draft`
- [x] 文档明确给出临时团队确认和 audience/fan-out 规则
- [x] 文档明确说明 parser 只定义接口与输出契约
- [x] 文档可以被后续实现和控制台设计直接引用
