# 01 Plan

## Phases
1. 第二专项选型与契约冻结
2. provider 实现与本地自测
3. gateway 路由策略校准
4. 前端联调与验收

## Detailed steps
- 选定专项能力边界与关键交互事件。
- 提供 `.well-known/manifest` 与 `invoke/interact` 接口。
- 调整路由关键词/评分策略，确保命中区分度。
- 执行多专项并发场景测试（Top2 + 切换 + fallback）。
- 更新 conformance 与文档。

## Risks & mitigations
- Risk: 专项语义重叠导致误路由。
- Mitigation: 增强关键词权重与澄清策略。
- Risk: 多 run 并发导致时间线体验混乱。
- Mitigation: 强制展示来源标签与 runId 关联。
