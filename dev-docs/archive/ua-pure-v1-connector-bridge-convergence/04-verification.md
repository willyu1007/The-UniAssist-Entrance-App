# 04 Verification

## Planning bundle review
- Status: passed
- Evidence:
  - `01-plan.md` now defines:
    - external capability proof scenarios
    - ledger convergence exit criteria
    - dynamic loading acceptance gates
  - `02-architecture.md` now defines:
    - ledger convergence model
    - governance carry-over
    - boundary exclusions

## Current repo external-path scan
- Status: passed
- Command:
  - `rg -n "sample|connector|bridge|external_runtime|action-binding|event-subscription|hardcoded|adapter" apps/connector-runtime/src apps/workflow-platform-api/src apps/workflow-runtime/src packages/workflow-contracts/src | head -n 250`
- Notes:
  - confirmed:
    - connector runtime still hardcodes sample adapters
    - platform API already exposes connector and bridge control-plane surfaces
    - runtime ledger already persists bridge and connector extension records

## Package-closure review
- Status: passed
- Notes:
  - `T-036` now clearly extends `T-034` instead of substituting for it, and it no longer leaves dynamic connector loading as an implicit follow-up.

## Execution-stage verification to record later
- completed below

## Typecheck
- Status: passed
- Commands:
  - `pnpm --filter @uniassist/workflow-contracts typecheck`
  - `pnpm --filter @uniassist/connector-ci-pipeline-sample typecheck`
  - `pnpm --filter @uniassist/connector-sdk typecheck`
  - `pnpm --filter @uniassist/connector-runtime typecheck`
  - `pnpm --filter @uniassist/workflow-runtime typecheck`
  - `pnpm --filter @uniassist/workflow-platform-api typecheck`

## Targeted tests
- Status: passed
- Commands:
  - `node --import tsx --test tests/connector-registry.test.ts`
    - workspace: `apps/connector-runtime`
  - `node --import tsx --test tests/connector-runtime.test.mjs`
    - workspace: `apps/workflow-runtime`
    - covers: deployed connector success, undeployed connector rejection, connector-runtime restart callback lookup, projected connector receipt state, and adapter-supplied `receiptKey` dedupe
  - `node --import tsx --test tests/external-runtime-bridge.test.mjs`
    - workspace: `apps/workflow-runtime`
    - covers: bridge approval/result/cancel flow under the shared pure-`v1` runtime
  - `node --import tsx --test tests/external-receipt-regression.test.ts`
    - workspace: `apps/workflow-runtime`
    - covers:
      - rejected connector callback emits `external.callback.received`
      - rejected bridge callback emits `external.callback.received`
      - event-subscription receipt handoff rejects run/source mismatches
  - `node --test tests/connector-runtime-governance.test.mjs`
    - workspace: `apps/workflow-platform-api`
    - covers: event-subscription runtime config, dispatch dedupe, deployed/active gating, and runtime receipt handoff with `triggerBindingId`
  - `node --test tests/external-runtime-bridge.test.mjs`
    - workspace: `apps/workflow-platform-api`

## Env contract
- Status: passed
- Commands:
  - `python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py validate --root . --out dev-docs/active/ua-pure-v1-connector-bridge-convergence/artifacts/env/03-validation-log.md`
  - `python3 -B -S .ai/skills/features/environment/env-contractctl/scripts/env_contractctl.py generate --root . --out dev-docs/active/ua-pure-v1-connector-bridge-convergence/artifacts/env/04-context-refresh.md`
- Evidence:
  - `artifacts/env/03-validation-log.md`
  - `artifacts/env/04-context-refresh.md`

## DB contract and migration
- Status: passed
- Commands:
  - `DATABASE_URL='postgresql:///postgres?host=/tmp' pnpm exec prisma validate --schema prisma/schema.prisma`
  - `pnpm exec prisma migrate diff --from-schema-datamodel <HEAD schema> --to-schema-datamodel prisma/schema.prisma --script`
  - `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`
- Evidence:
  - `artifacts/db/02-prisma-validate.txt`
  - `artifacts/db/03-migration-diff.sql`
  - `artifacts/db/04-context-sync.txt`

## Notes
- The migration delta is intentionally minimal:
  - add `connector_event_receipts.run_id`
  - add `idx_connector_event_receipts_run_received_at`
- Event-subscription receipt persistence is now runtime-owned after dispatch resolves the canonical run, so duplicate deliveries stay idempotent without reintroducing API-local state authority.
- The previously hanging connector integration path was repaired by making the T-036 child-process tests terminate their spawned service trees deterministically.
