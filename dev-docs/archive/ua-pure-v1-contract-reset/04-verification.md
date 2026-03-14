# 04 Verification

## Contract/package reset
- Status: passed
- Evidence:
  - `packages/workflow-contracts/src/types.ts` no longer imports `@uniassist/contracts`
  - mainline exports now use pure-`v1` run/interaction DTOs and formal event kinds
  - gateway-only compat bridge types moved to `apps/gateway/src/gateway-types.ts`

## OpenAPI baseline freeze
- Status: passed
- Commands:
  - `python3 - <<'PY' ... yaml.safe_load('docs/context/api/openapi.yaml') ... PY`
- Evidence:
  - `POST /v1/agents/{agentId}/runs` is the production ingress
  - `POST /v1/runs` is documented as studio/debug-only direct version start
  - `POST /v1/interactions/{interactionRequestId}/responses` is the authoritative interaction resume path
  - `/v1/runs/{runId}/resume` is absent from the baseline
  - governance-change endpoints are explicitly marked auxiliary / non-authoritative

## Prisma SSOT and DB context
- Status: passed
- Commands:
  - `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`
- Evidence:
  - `prisma/schema.prisma` removed authoritative compat columns from workflow template/run/node-run tables
  - `interaction_requests` exists in SSOT and `docs/context/db/schema.json`
  - context checksum updated for both `api-openapi` and `db-schema`

## Typecheck gate
- Status: passed
- Commands:
  - `pnpm --filter @uniassist/workflow-contracts typecheck`
  - `pnpm --filter @uniassist/workflow-runtime typecheck`
  - `pnpm --filter @uniassist/workflow-platform-api typecheck`
  - `pnpm --filter @uniassist/control-console typecheck`
  - `pnpm --filter @uniassist/convex-projection-experiment typecheck`

## Context verification
- Status: passed
- Commands:
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`

## Grep gate
- Status: passed with scoped residual debt
- Command:
  - `rg -n "compatProviderId|WorkflowEntryRegistryEntry|WorkflowEventProjectionRequest|WorkflowStartRequest|WorkflowResumeRequest|waiting_input|approval_requested|approval_decided|artifact_created|artifact_updated|run_state|node_state|/v1/runs/\\{runId\\}/resume" apps packages prisma docs/context --glob '!apps/gateway/**' --glob '!apps/frontend/**' --glob '!packages/contracts/**' --glob '!**/tests/**' --glob '!**/*.test.*'`
- Result:
  - no hits remain in mainline contract/API/UI/projection surfaces after DB context refresh
  - a stricter raw scan for `replyToken|taskId` still finds:
    - `apps/workflow-runtime/src/service.ts` local compat executor adapter logic
    - legacy `task_threads` SSOT rows that are not authoritative workflow runtime records
    - provider sample apps
  - those residual hits are recorded as follow-on cleanup/input for `T-034`, `T-036`, and `T-037`, not as authoritative contract surface

## Post-review regression verification
- Status: passed with residual compat debt noted
- Commands:
  - `pnpm --filter @uniassist/workflow-runtime typecheck`
  - `pnpm --filter @uniassist/workflow-platform-api typecheck`
  - `pnpm --filter @uniassist/provider-sample typecheck`
  - `node --test apps/workflow-runtime/tests/workflow-runtime.test.mjs`
  - `node --test apps/workflow-runtime/tests/external-runtime-bridge.test.mjs`
  - `node --test apps/workflow-platform-api/tests/workflow-platform-api.test.mjs`
  - `rg -n "approve_request:|reject_request:|compatProviderId|replyToken|taskId|WorkflowEntryRegistryEntry|WorkflowStartRequest|WorkflowResumeRequest|WorkflowEventProjectionRequest|/v1/runs/\\{runId\\}/resume|/v1/runs/:runId/resume" apps/workflow-platform-api apps/workflow-runtime apps/control-console packages/workflow-contracts docs/context/api/openapi.yaml prisma/schema.prisma docs/context/db/schema.json --glob '!apps/gateway/**' --glob '!apps/frontend/**' --glob '!packages/contracts/**' --glob '!dev-docs/**'`
- Evidence:
  - runtime interaction recovery now passes end-to-end, including `interactionRequestId` resume and `ready(require_user_confirm)` continuation
  - external-runtime bridge approval flow still passes after moving tests to explicit approval-decision APIs
  - platform API interaction responses now pass through authoritative runtime lookup instead of recent-run scanning
  - strict raw grep still reports residual compat terms in:
    - `apps/workflow-runtime/src/service.ts` local compat adapter state
    - `apps/workflow-platform-api/src/server.ts` retained `POST /v1/runs/:runId/resume` compatibility route returning `410`
    - legacy/test/sample code outside the authoritative contract surface
