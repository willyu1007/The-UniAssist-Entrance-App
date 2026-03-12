# 01 Plan

## Phases
1. Governance and contract setup
2. Convex experiment workspace
3. Platform API projection seam and fallback
4. Automated verification and go/no-go capture

## Detailed steps
- 建立任务包、同步 project governance、更新 `T-011` 总包状态。
- 扩展 env contract，增加 `UNIASSIST_ENABLE_CONVEX_RUNBOARD_EXPERIMENT` 与 `UNIASSIST_CONVEX_URL`，刷新生成产物。
- 新增 `packages/convex-projection-experiment`，包含：
  - `convex/schema.ts`
  - `convex/runboard.ts`
  - thin client wrapper
  - local smoke test
- 在 `apps/workflow-platform-api` 落 `RunboardProjectionAdapter` seam：
  - noop / convex 双实现
  - startup bootstrap recent 40 runs
  - best-effort run summary upsert
  - `/v1/runs` projection-first + authoritative fallback
  - Convex subscription bridge 优先触发 `run.updated`
- 补平台级集成测试，覆盖 bootstrap、status update、subscription bridge、fallback 与非 run SSE 行为。

## Risks & mitigations
- Risk:
  - Convex 自动化需要非交互本地 bootstrap，CLI 行为不稳定。
  - Mitigation:
    - 将 local bootstrap 封装在独立脚本/测试 helper 中，失败时显式回退 authoritative path。
- Risk:
  - projection bridge 与 authoritative invalidation 双发导致控制台重复刷新。
  - Mitigation:
    - bridge healthy 时只让 Convex 负责 `run.updated`；其余事件保持原路径。
- Risk:
  - run summary 构建逻辑与 runtime authoritative summary 漂移。
  - Mitigation:
    - 集成测试对比 `/v1/runs` 与 projection query 返回值，锁定字段级一致性。
