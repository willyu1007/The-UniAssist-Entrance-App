# 04 Verification

- 2026-03-13:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - Result: PASS
  - Notes: 注册 `T-031`，并刷新 `.ai/project/main/{registry,dashboard,feature-map,task-index}`。

- 2026-03-13:
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
  - Result: PASS

- 2026-03-13:
  - `python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py validate --root . --out dev-docs/active/ua-convex-projection-experiment/artifacts/env/03-validation-log.md`
  - Result: PASS
  - Evidence: `dev-docs/active/ua-convex-projection-experiment/artifacts/env/03-validation-log.md`

- 2026-03-13:
  - `python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py generate --root . --out dev-docs/active/ua-convex-projection-experiment/artifacts/env/04-context-refresh.md`
  - Result: PASS
  - Evidence: `dev-docs/active/ua-convex-projection-experiment/artifacts/env/04-context-refresh.md`

- 2026-03-13:
  - `pnpm --filter @baseinterface/convex-projection-experiment typecheck`
  - Result: PASS

- 2026-03-13:
  - `pnpm --filter @baseinterface/convex-projection-experiment test`
  - Result: PASS
  - Notes: smoke test 现在会优先复用已存在的 local backend；若不存在再自举本地 deployment。

- 2026-03-13:
  - `pnpm --filter @baseinterface/workflow-platform-api typecheck`
  - Result: PASS

- 2026-03-13:
  - `pnpm --filter @baseinterface/workflow-contracts typecheck`
  - Result: PASS

- 2026-03-13:
  - `pnpm --filter @baseinterface/control-console typecheck`
  - Result: PASS

- 2026-03-13:
  - `pnpm --filter @baseinterface/control-console test`
  - Result: PASS

- 2026-03-13:
  - `node --test apps/workflow-platform-api/tests/convex-runboard-projection.test.mjs`
  - Result: PASS
  - Notes: 启动真实 provider/runtime/platform 与 local Convex deployment，覆盖 startup bootstrap、projection-backed `/v1/runs`、approval-driven status change、run detail authoritative query、SSE `draft/approval/artifact/run.updated`、以及坏 Convex URL 场景下的透明 fallback。

- 2026-03-13:
  - `pnpm --filter @baseinterface/workflow-platform-api test`
  - Result: PASS

- 2026-03-13:
  - `pnpm --filter @baseinterface/workflow-platform-api typecheck`
  - Result: PASS
  - Notes: 覆盖非法 Convex URL 降级与 projection recovery 修复后的 controller 编译验证。

- 2026-03-13:
  - `node --test apps/workflow-platform-api/tests/runboard-projection-summary-regression.test.mjs`
  - Result: PASS
  - Notes: 直接验证 `buildRunboardProjectionSummary()` 会对重复 `requestedActorId` 去重。

- 2026-03-13:
  - `node --test apps/workflow-platform-api/tests/convex-runboard-projection.test.mjs`
  - Result: PASS
  - Notes: 额外覆盖 projection 被清空后 controller 自动 invalidation + rebootstrap，以及 `UNIASSIST_CONVEX_URL=not-a-url` 时平台透明 fallback。

- 2026-03-13:
  - `pnpm --filter @baseinterface/workflow-platform-api test`
  - Result: PASS
  - Notes: 复跑全量平台测试，确认 B5/B6/B7/B8/B9 与新增 summary regression 用例均未回归。
