# 00 Overview

## Status
- State: done
- Status note: `T-017` 已完成历史 teaching sample 设计与平台通用字段边界纠偏；仓库当前样例实现已转为中性的 `sample-review` 命名，本 bundle 仅保留为历史设计基线。
- Next step: 归档该 bundle，供追溯首个 sample validation 场景的历史设计决策。

## Goal
建立一份 handoff-ready 的历史 teaching sample 设计基线，明确个性化评估 agent 如何在 workflow 中受控探索、结构化收敛、经过教师审核，并向不同受众交付。该 bundle 不再代表当前产品定位。

## Non-goals
- 不实现上传解析、模型调用、消息外发
- 不定义所有教学产品页面或运营流程
- 不做 parser、rubric、delivery template 的字段级实现
- 不设计 connector/action layer

## Context
- `T-011` 在设计阶段曾将 teaching scenario 作为首个验证样本；当前 repo 已将该样例实现收口为中性 sample validation workflow。
- `T-018` 已提供 artifact/actor/delivery 的 authoritative object 边界。
- `T-013` 已提供 `RecipeDraft` 的控制面对象与晋升路径。

## Acceptance criteria (high level)
- [x] 文档明确给出 `上传 -> 解析接口 -> 个性化评估 agent -> 教师审核 -> fan-out 交付`
- [x] 文档明确给出 `AssessmentDraft / EvidencePack / ReviewableDelivery / AnalysisRecipe draft`
- [x] 文档明确给出临时团队确认和 audience/fan-out 规则
- [x] 文档明确说明 parser 只定义接口与输出契约
- [x] 文档可以被后续实现和控制台设计直接引用
