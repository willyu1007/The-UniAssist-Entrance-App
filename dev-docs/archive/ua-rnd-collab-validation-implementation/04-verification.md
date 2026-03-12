# 04 Verification

## Automated checks
- `2026-03-12` `pnpm --filter @baseinterface/workflow-contracts typecheck` -> PASS
- `2026-03-12` `pnpm --filter @baseinterface/workflow-runtime test` -> PASS
- `2026-03-12` `pnpm --filter @baseinterface/workflow-platform-api test` -> PASS
- `2026-03-12` `pnpm --filter @baseinterface/control-console test` -> PASS
- `2026-03-12` `pnpm --filter @baseinterface/connector-source-control-sample typecheck` -> PASS
- `2026-03-12` `pnpm --filter @baseinterface/connector-runtime typecheck` -> PASS
- `2026-03-12` `pnpm --filter @baseinterface/provider-sample typecheck` -> PASS
- `2026-03-12` `pnpm --filter @baseinterface/control-console typecheck` -> PASS
- `2026-03-12` `node .ai/scripts/ctl-project-governance.mjs lint --check --project main` -> PASS
- `2026-03-13` `pnpm --filter @baseinterface/workflow-contracts typecheck` -> PASS
- `2026-03-13` `pnpm --filter @baseinterface/connector-source-control-sample typecheck` -> PASS
- `2026-03-13` `pnpm --filter @baseinterface/connector-issue-tracker-sample typecheck` -> PASS
- `2026-03-13` `pnpm --filter @baseinterface/connector-ci-pipeline-sample typecheck` -> PASS
- `2026-03-13` `pnpm --filter @baseinterface/workflow-runtime test` -> PASS
- `2026-03-13` `pnpm --filter @baseinterface/workflow-platform-api test` -> PASS
- `2026-03-13` `pnpm --filter @baseinterface/control-console test` -> PASS
- `2026-03-13` `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` -> PASS
- `2026-03-13` `node .ai/scripts/ctl-project-governance.mjs lint --check --project main` -> PASS

## Manual smoke checks
- 单独手工 smoke 未额外执行；本包验收点已由 automated integration/UI tests 覆盖：
- 主变更流从 manual start 到 approval、`issue_tracker`/`source_control` 写操作、`ci_pipeline` callback 续跑、`DeliverySummary` inspect 全部通过。
- `event_subscription` companion flow 从 `pipeline.finished` dispatch 到 companion run start 通过，且 governance 未批准时 runtime-config 仍按预期拒绝。
- control-console 现有 runs 页面可按 artifact 拉取 `/v1/artifacts/:artifactId` 并显示 typed payload / lineage。

## Rollout / Backout (if applicable)
- Rollout:
  - 以 sample-only capability 形式交付，不扩 northbound API、DB schema 或 console route
- Backout:
  - 若 `source_control` sample connector 或 companion flow 不稳定，可回退 `source_control-sample` 注册、B8 scenario helper/test、以及 control-console artifact detail UI，不影响 `B7` 现有 issue/CI path
