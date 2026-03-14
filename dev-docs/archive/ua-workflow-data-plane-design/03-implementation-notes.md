# 03 Implementation Notes

## Current state
- This subtask is design-only.
- No Prisma schema change, migration, repository layer, or API implementation has been started in this task.

## Initial decisions
- 本子包为 `T-011` 下的后续设计子包，直接依赖 `T-012 / ua-workflow-core-skeleton-design`。
- `workflow/run/node/artifact/approval` 继续作为 `P1` core objects。
- `ActorProfile`, `ActorMembership`, `AudienceSelector`, `DeliverySpec`, `DeliveryTarget` 作为 `P1` companion objects 进入主数据面。
- `TimelineEvent`, `task_question`, `task_state`, runboard row model, approval inbox row model 全部视为 projection。
- authoritative store 继续为 Postgres/Prisma；本子包不为 Convex 预留主数据职责。
- actor/delivery 领域不创建 `teacher/student/parent` 之类专属表。
- `ActorProfile`、`ActorMembership`、`DeliverySpec` 采用“固定平台外壳 + 自由 JSON 载荷”，不引入 `schema_ref`。
- `actor_type` 保留为平台级主体分类，不等于业务角色。
- `ActorMembership.relation_type` 保留为固定字段，首版采用可扩展字符串，并提供平台推荐值，不强制有限枚举。
- `DeliverySpec.delivery_mode` 首版限制为 `manual_handoff / assisted_delivery / auto_delivery` 三个平台值。
- `DeliverySpec.status` 首版限制为 `draft / validated / active / superseded / archived`。
- `DeliverySpec` 首版不包含渠道渲染模板，只冻结受众解析、artifact 绑定、review 与策略配置。

## Deferred decisions
- 具体 Prisma model 字段与索引策略
- `Artifact` revision/versioning 的最终表形态

## Follow-up TODOs
- 用本子包结果支撑 `ua-builder-draft-sot-design`
- 用本子包结果支撑归档后的 `ua-teaching-assessment-scenario-design` 历史样例基线
- 用本子包结果支撑 `ua-control-console-foundation-design`
