# Teaching Validation Implementation — Historical Sample Bundle Roadmap

## Goal
- 将 `T-017` 的 teaching validation 设计基线落成可运行 implementation bundle，并验证 workflow platform 的 artifact / approval / delivery / recipe capture 主线。
- 历史任务名中的 teaching validation 只表示首个 sample validation bundle 的命名，不代表项目当前产品定位。

## Inputs
- Parent bundle: `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
- Scenario baseline: `dev-docs/archive/ua-teaching-assessment-scenario-design/02-architecture.md`
- Draft baseline: `dev-docs/active/ua-builder-draft-sot-design/02-architecture.md`
- Data plane baseline: `dev-docs/active/ua-workflow-data-plane-design/02-architecture.md`

## Frozen decisions
- Rename in this bundle: `provider-sample -> provider-sample`, `plan -> sample`, `compat-sample -> compat-sample`
- No new public endpoint set; only extend run/artifact shapes
- No real parser/upload/LLM integration
- Canonical node chain（历史实现命名）: `parse_materials -> generate_assessment -> teacher_review -> fanout_delivery -> finish`

## Verification intent
- Prove typed artifacts and approval/delivery gates on a real run
- Prove restart-safe read path from Postgres
- Prove `RecipeDraft` capture is lineage-aware and idempotent
