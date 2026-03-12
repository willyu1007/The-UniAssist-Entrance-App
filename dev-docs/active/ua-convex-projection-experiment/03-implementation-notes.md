# 03 Implementation Notes

- 2026-03-13: 建立 `B9` 实现包骨架，任务号预留为 `T-031`，等待 governance sync 确认。
- 2026-03-13: 继承 `T-011` / `T-016` 冻结边界，保持 Convex 仅为 projection/read-model。
- 2026-03-13: 新增 `packages/convex-projection-experiment` workspace，落地 `convex/schema.ts`、`convex/runboard.ts`、thin wrapper `src/runboard-projection.ts`，并为本地实验提供 `dev:local` / `dev:local:watch` / smoke test。
- 2026-03-13: 在 `env/contract.yaml` 与 `env/values/dev.yaml` 增加 `UNIASSIST_ENABLE_CONVEX_RUNBOARD_EXPERIMENT`、`UNIASSIST_CONVEX_URL`，保持默认关闭，只补 local/dev 契约。
- 2026-03-13: 在 `apps/workflow-platform-api` 增加 `RunboardProjectionAdapter` seam 与 `RunboardProjectionController`，实现 bootstrap recent-40、best-effort upsert、projection-backed `/v1/runs`、Convex subscription diff -> `run.updated`，并保留 authoritative direct publish 兜底。
- 2026-03-13: `platform-controller.ts` 的 run-affecting 路径统一改走 `publishRunSnapshotEvents()`，确保 `approval.updated` / `artifact.updated` 继续直发，`run.updated` 由 projection healthy 时延后给桥接触发，否则直接回退。
- 2026-03-13: 新增平台级集成测试 `apps/workflow-platform-api/tests/convex-runboard-projection.test.mjs`，以真实 provider/runtime/platform/Convex 覆盖 bootstrap、projection sync、run detail authoritative 读取、SSE 不回归与 Convex 不可用 fallback。
- 2026-03-13: 修正 bootstrap 语义为“以 authoritative recent window 为准精确替换 projection”，避免本地 Convex deployment 复用时残留旧文档污染 `/v1/runs` 对齐结果。
- 2026-03-13: 修正 projection summary builder 的 `requestedActorIds` 语义，改为与 authoritative runtime 一致的 `Set` 去重，避免 projection path 返回重复 actorId 并引发无意义的 `run.updated` 抖动。
- 2026-03-13: `createRunboardProjectionAdapter()` 对非法 `UNIASSIST_CONVEX_URL` 改为构造期捕获并降级到 `noop` adapter，确保实验开关打开但 URL 语法错误时平台仍能启动并回退到 authoritative path。
- 2026-03-13: `RunboardProjectionController` 在 subscription 观测到 recent-window shrink 时会主动失效 projection 状态并触发 recovery bootstrap；恢复触发不再依赖瞬时 `subscriptionHealthy`，避免 backend reset/数据清空后长期停留在“只 fallback、不回填 projection”的半失效状态。
