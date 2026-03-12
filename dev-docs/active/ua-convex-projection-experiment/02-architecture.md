# 02 Architecture

## Boundaries
- authoritative store 继续是 `workflow-runtime` / Postgres/Prisma；Convex 不持有 truth。
- `apps/control-console` 只能经由 `workflow-platform-api` 获取列表与 stream，不直连 Convex。
- 实验范围限定在 `Runboard` recent-first 列表摘要；run detail 继续走现有 authoritative query。

## Proposed design
- 新增 `packages/convex-projection-experiment`：
  - Convex table `runboardSummaries`
  - query `listRecent`
  - mutation `upsert`
  - mutation `bootstrap`
  - thin client wrapper，供平台 API 使用
- `workflow-platform-api` 内部新增 `RunboardProjectionAdapter` 抽象：
  - `bootstrapRecentRuns(limit, runs)`
  - `upsertRunSummary(snapshot)`
  - `listRecentRuns(limit)`
  - `subscribeRecentRuns(limit, onChange)`
  - `dispose()`
- 控制台 stream 策略：
  - bridge healthy: `run.updated` 由 Convex subscription diff 触发
  - bridge unhealthy: 回退到现有 authoritative `run.updated`
  - `approval.updated` / `artifact.updated` / `draft.updated` 不走 Convex
- `/v1/runs` 策略：
  - experiment enabled + adapter query-ready + `limit <= 40` -> projection
  - 其他情况 -> 现有 runtime query

## Explicit exclusions
- 不新增控制台 route / DTO / direct data source
- 不将 approval inbox、draft feed、notification stream 纳入同一实验
- 不在本包内引入 cloud deployment / secret rotation
