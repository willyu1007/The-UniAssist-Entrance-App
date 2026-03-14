# 04 Verification

## Planned checks
- `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
- `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- `pnpm --filter @uniassist/workflow-contracts typecheck`
- `pnpm --filter @uniassist/workflow-runtime test`
- `pnpm --filter @uniassist/workflow-platform-api test`
- `pnpm --filter @uniassist/control-console test`
- `pnpm --filter @uniassist/control-console typecheck`
- `python3 .ai/skills/features/ui/ui-governance-gate/scripts/ui_gate.py run --mode full`

## Results
- `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - Passed earlier in implementation bootstrap；task bundle 已注册到 project governance。
- `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
  - Passed earlier with repo 内其他 legacy task status warning；本 task 无新增治理错误。
- `pnpm --filter @uniassist/workflow-contracts typecheck`
  - Passed
- `pnpm --filter @uniassist/workflow-runtime typecheck`
  - Passed
- `pnpm --filter @uniassist/workflow-platform-api typecheck`
  - Passed
- `pnpm --filter @uniassist/control-console typecheck`
  - Passed
- `pnpm --filter @uniassist/workflow-runtime test`
  - Passed；覆盖 internal run summary / approval queue/detail / explicit decision 路径
- `pnpm --filter @uniassist/workflow-platform-api test`
  - Passed；覆盖 run list、approval queue/detail/decision、draft spec patch、revision conflict、console SSE invalidation，以及 missing-resource `404` / malformed patch `400`
- `pnpm --filter @uniassist/control-console test`
  - Passed；6 tests，包含 invalid graph JSON 表单错误与 SSE stale -> polling -> retry 回归
- `pnpm --filter @uniassist/control-console build`
  - Passed
- `python3 .ai/skills/features/ui/ui-governance-gate/scripts/ui_gate.py run --mode full`
  - Passed
  - Evidence: `.ai/.tmp/ui/20260312T024453Z-40635/ui-gate-report.md`
  - Result summary: 0 errors / 0 warnings; eslint/stylelint/playwright auto-skipped because repo lacks corresponding config at this root

## Review-fix reruns
- `pnpm --filter @uniassist/workflow-contracts typecheck`
  - Re-ran after control-console stream heartbeat type addition；Passed
- `pnpm --filter @uniassist/workflow-platform-api typecheck`
  - Re-ran after runtime error propagation / patch validation changes；Passed
- `pnpm --filter @uniassist/workflow-platform-api test`
  - Re-ran after review fixes；Passed
- `pnpm --filter @uniassist/control-console typecheck`
  - Re-ran after SSE stale fallback / Studio error-state changes；Passed
- `pnpm --filter @uniassist/control-console test`
  - Re-ran after review fixes；Passed
- `pnpm --filter @uniassist/control-console build`
  - Re-ran after review fixes；Passed
