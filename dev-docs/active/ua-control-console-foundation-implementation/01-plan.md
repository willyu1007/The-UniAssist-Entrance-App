# 01 Plan

## Phases
1. Governance bootstrap
2. Contracts + runtime internal API
3. Platform API query/mutation/SSE layer
4. Control console workspace
5. Verification and context sync

## Detailed steps
- 创建 `B4` task bundle，更新 `T-011` 状态说明，并同步 project governance。
- 扩展 `packages/workflow-contracts`：
  - run list summary DTO
  - approval queue/detail/decision DTO
  - draft spec patch DTO
  - control console SSE invalidation DTO
- 为 `apps/workflow-runtime` 增加 internal run summary / approval queue/detail / approval decision 路由与 service/repository 支撑。
- 为 `apps/workflow-platform-api` 增加：
  - northbound control-console routes
  - section-patch draft mutation with `baseRevisionId + changeSummary`
  - approval decision orchestration
  - SSE invalidation stream
- 新增 `apps/control-console` workspace：
  - `React + Vite + TypeScript`
  - `TanStack Router + TanStack Query`
  - `/runs`, `/approvals`, `/drafts`, `/studio`
  - SSE-first + polling fallback transport
  - `Vitest + Testing Library` smoke
- 跑 contracts / runtime / platform / control-console typecheck 与测试，执行 UI governance gate，并回写 verification。

## Risks & mitigations
- Risk: 控制台 query 需求迫使 B4 引入新的 projection store。
  - Mitigation: 优先复用 run snapshot、approval record、artifact lineage，在 platform layer 做聚合 DTO。
- Risk: Workflow Studio 变成完整 editor 产品。
  - Mitigation: 只做 spec-first section patch、revision compare、只读 DAG 预览，不做 canvas 或 merge/conflict。
- Risk: approval action 直接泄露 runtime resume 细节到前端。
  - Mitigation: 平台层提供显式 approval decision endpoint，并在内部解析 runtime action contract。
- Risk: Web UI 风格偏离现有 `ui/` contract。
  - Mitigation: 按 `ui-feature-delivery` workflow 执行，强制走 `ui/styles/ui.css` 与 gate。
