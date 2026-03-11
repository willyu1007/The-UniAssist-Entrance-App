# 03 Implementation Notes

## Status
- Current status: `done`
- Last updated: 2026-03-11

## What changed
- 初始化 `B1 / ua-platform-foundation-implementation` task bundle。
- 新增 `packages/workflow-contracts`，冻结 B1 所需 workflow spec / runtime snapshot / formal event / registry DTO。
- 新增 `packages/executor-sdk`，提供 compat executor registry 解析和对 `/v0/invoke` / `/v0/interact` 的直接调用封装。
- 新增 `apps/workflow-runtime`，落最小 runtime 骨架：
  - internal routes: `start-run` / `resume-run` / `runs/:runId` / `approvals` / `artifacts/:artifactId`
  - 支持 `executor`、`approval_gate`、`end`
  - 支持 `waiting_input`、`waiting_approval`、`resume`
  - 成功完成 executor 节点时生成最小 `artifact_created`
- 新增 `apps/workflow-platform-api`，落最小 `/v1` 面：
  - `POST /v1/workflows`
  - `GET /v1/workflows`
  - `GET /v1/workflows/:workflowId`
  - `POST /v1/runs`
  - `GET /v1/runs/:runId`
  - `POST /v1/runs/:runId/resume`
  - `GET /v1/approvals`
  - `GET /v1/artifacts/:artifactId`
- gateway 完成 workflow 兼容接入：
  - 新增 `workflow entry registry` / feature flag config
  - `/v0/ingest` 支持 `pending reply -> workflow registry hit -> legacy provider routing`
  - `/v0/interact` 支持 workflow task resume 和 approval action resume
  - 新增 `/internal/workflow-events` 投影入口
- worker 新增 `workflow_formal_event` channel handling：
  - timeline channel 维持现状
  - workflow channel 通过 internal auth 回投 gateway `/internal/workflow-events`
  - 失败时把 outbox row 置回 `failed/dead_letter` 以便重试
- `provider-plan` internal auth 放行 `workflow-runtime`，避免 runtime 直调 compat executor 被 401 拦截。
- `prisma/schema.prisma` 已补 core + companion objects，并同步 `docs/context/db/schema.json`。
- 新增最小集成测试骨架：
  - `apps/workflow-runtime/tests/workflow-runtime.test.mjs`
  - `apps/workflow-platform-api/tests/workflow-platform-api.test.mjs`
  - `apps/gateway/tests/workflow-entry.mjs`
- 修正现有 `apps/gateway/tests/conformance.mjs` 的硬编码仓库路径，改为相对 repo root 计算。

## Decisions & tradeoffs
- `workflow entry` 采用 registry-driven feature flag 路径，不并入现有 provider 语义评分器。
- `provider-plan` 仅作为 compat executor 样例，而不是平台主对象 owner。
- `B1` 交付有限图执行骨架，不提前做 draft/console/connector。

## Known issues / follow-ups
- 当前 runtime / platform-api 仍以内存 store 为主，尚未切到 `pg repository` 持久化实现；B1 这一轮先保证 `/v1 -> runtime -> compat executor -> gateway projection` 闭环。
- worker 新 channel 的真实 Redis/outbox smoke 仍可在后续 staging drill 中补更强证据；B1 当前已覆盖 command-driven fan-out 与 gateway projection。
- `B2` 启动前建议把 runtime / platform-api 的内存 store 换成正式 repository，以避免 draft/publish path 叠加时再返工。

## Closure note
- 2026-03-11 已完成 B1 admission criteria：
  - `pnpm typecheck:workspaces` 通过
  - `@baseinterface/workflow-runtime` 测试通过
  - `@baseinterface/workflow-platform-api` 测试通过
  - `pnpm test:workflow-entry` 通过
  - `pnpm test:conformance` 在 workflow flag 关闭路径下通过
- B1 可视为平台主线的 `/v1 + compat projection` 基线，下一实施包应切换到 `B2`，而不是继续在 B1 上扩 scope。

## Pitfalls / dead ends (do not repeat)
- Keep the detailed log in `05-pitfalls.md` (append-only).
