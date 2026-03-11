# 04 Verification

## Verification log
- 2026-03-12
  - `pnpm typecheck:workspaces`
    - Passed
    - 在删除本轮新增测试产物和 `pg-mem` 依赖后复核 workspace 编译状态
- 2026-03-11
  - `pnpm install`
    - 用于刷新 `provider-sample` rename 后的 workspace links，使 `@baseinterface/workflow-contracts` 能被新包解析
  - `pnpm --filter @baseinterface/provider-sample typecheck`
    - Passed
  - `pnpm --filter @baseinterface/workflow-runtime typecheck`
    - Passed
  - `pnpm --filter @baseinterface/workflow-platform-api typecheck`
    - Passed
  - `pnpm typecheck:workspaces`
    - Passed
  - `pnpm --filter @baseinterface/workflow-runtime test`
    - Passed
    - 覆盖 canonical teaching workflow approve / reject 两条路径、typed artifact detail、run query companion objects
  - `pnpm --filter @baseinterface/workflow-platform-api test`
    - Passed
    - 覆盖 run-derived `RecipeDraft` capture、`capturedRecipeDrafts` 响应 shape、artifact typed payload / lineage 透传
  - `pnpm test:workflow-entry`
    - Passed
    - 覆盖 `sample` workflow entry registry 与 gateway workflow ingest path
  - `pnpm test:conformance`
    - Passed
    - direct sample provider task protocol 已对齐为 `subject -> materialsSummary -> ready -> execute`

## Planned checks
- `pnpm typecheck:workspaces`
- `pnpm --filter @baseinterface/workflow-runtime test`
- `pnpm --filter @baseinterface/workflow-platform-api test`
- `pnpm test:workflow-entry`
- `pnpm test:conformance`
