# 04 Verification

## Planned checks
1. Workspace typecheck
- Command: `pnpm typecheck:workspaces`

2. Gateway conformance
- Command: `pnpm test:conformance`

3. Platform API / runtime tests
- Command: `pnpm --filter @baseinterface/workflow-platform-api test`
- Command: `pnpm --filter @baseinterface/workflow-runtime test`

4. DB context sync
- Command: `pnpm db:sync-context`

## Results
1. Governance lint
- Command: `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Result: passed

2. DB context sync
- Command: `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`
- Result: passed
- Notes: `docs/context/db/schema.json` 已更新，`ctl-context touch` 成功。

3. Syntax checks for new JS tests
- Command: `node --check apps/gateway/tests/conformance.mjs`
- Command: `node --check apps/workflow-runtime/tests/workflow-runtime.test.mjs`
- Command: `node --check apps/workflow-platform-api/tests/workflow-platform-api.test.mjs`
- Command: `node --check apps/gateway/tests/workflow-entry.mjs`
- Result: passed

4. Workspace install / typecheck / integration tests
- Command attempted: `pnpm install`
- Command attempted: `pnpm install --filter @baseinterface/contracts --filter @baseinterface/shared --filter @baseinterface/executor-sdk --filter @baseinterface/workflow-contracts --filter @baseinterface/provider-plan --filter @baseinterface/gateway --filter @baseinterface/workflow-runtime --filter @baseinterface/workflow-platform-api --filter @baseinterface/worker`
- Command attempted: `pnpm install --prefer-offline`
- Result: eventually passed after retry
- Evidence:
  - install first failed with transient `ERR_PNPM_META_FETCH_FAIL`
  - later retry `pnpm install --prefer-offline` completed successfully

5. Workspace typecheck
- Command: `pnpm typecheck:workspaces`
- Result: passed

6. Runtime integration test
- Command: `pnpm --filter @baseinterface/workflow-runtime test`
- Result: passed
- Notes: 首轮并行验证时与其他测试发生端口冲突；为避免假失败，已将 B1 测试端口改到独立区间后串行重跑通过。

7. Platform API integration test
- Command: `pnpm --filter @baseinterface/workflow-platform-api test`
- Result: passed

8. Gateway workflow-entry compatibility test
- Command: `pnpm test:workflow-entry`
- Result: passed

9. Gateway conformance
- Command: `pnpm test:conformance`
- Result: passed
- Notes: 在 `workflow flag` 关闭时，legacy `/v0` 行为未回归。
