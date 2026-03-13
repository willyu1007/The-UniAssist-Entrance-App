# 01 Plan

## Objective for this task
把 pure-`v1` 合同冻结成后续任务可直接消费的基线，避免 `T-034` 到 `T-037` 在实现阶段重新争论对象、命名、identity、resume 语义和 schema owner。

## Admission criteria
- `T-032` 仍是唯一 rewrite baseline
- `T-019` 已冻结 agent 生命周期与 trigger owner 的方向
- `T-021` 已冻结 approval / policy / secret / scope 的治理方向
- 当前 repo 仍存在 compat 字段和 `/v0` 投影，需要明确 removal ledger

## Phases
1. Contract debt inventory and removal ledger
2. Pure-`v1` object and API baseline freeze
3. Persistence and context handoff freeze
4. Consumer review and package closure

## Phase details
### 1. Contract debt inventory and removal ledger
- Inventory the active contract surfaces that still define or consume compat semantics:
  - `packages/workflow-contracts`
  - `apps/workflow-platform-api`
  - `apps/workflow-runtime`
  - `docs/context/api/openapi.yaml`
  - `prisma/schema.prisma`
  - `docs/context/db/schema.json`
- Produce an explicit removal ledger for:
  - `compatProviderId`
  - `providerId` as workflow identity
  - `replyToken`
  - `taskId` as compat projection
  - `WorkflowEntryRegistryEntry`
  - provider-shaped or gateway-shaped event terminology in mainline contracts
- Exit criteria:
  - every removed semantic is named
  - every known code hotspot has an owning follow-on task

### 2. Pure-`v1` object and API baseline freeze
- Freeze the authoritative object matrix:
  - control-plane objects
  - governance objects
  - runtime ledger objects
  - execution-extension objects
- Freeze the pure-`v1` API surfaces:
  - `agent-first` run start
  - run query
  - run cancel
  - approval decision by `approvalRequestId`
  - interaction resume by `interactionRequestId`
  - studio/debug-only direct version run
- Freeze the formal event model:
  - run lifecycle events
  - node lifecycle events
  - approval events
  - interaction events
  - artifact events
  - external callback receipts
- Exit criteria:
  - DTO names and identity semantics are stable
  - no mainline contract still depends on compat alias fields

### 3. Persistence and context handoff freeze
- Define the persistence planning outputs required for later implementation:
  - which tables/columns survive
  - which new records are required
  - which compat columns/tables are deleted later by `T-037`
  - ordering constraints for migrations and context refresh
- Define the context handoff:
  - `docs/context/api/openapi.yaml`
  - `docs/context/db/schema.json`
- Exit criteria:
  - `T-034` and `T-035` can implement against a fixed persistence plan
  - `T-037` has a concrete deletion target list

### 4. Consumer review and package closure
- Review `T-034`, `T-035`, and `T-036` against the frozen baseline.
- Confirm each consumer package can proceed without reopening:
  - object identities
  - API names
  - resume semantics
  - event ownership
- Exit criteria:
  - `T-033` can be treated as the contract authority for the rest of the rewrite

## Outputs
- pure-`v1` object ownership matrix
- DTO and identity matrix
- event taxonomy and envelope rules
- persistence-planning handoff
- removal ledger and grep gate definition

## Dependencies
- Parent baseline:
  - `T-032 / ua-pure-v1-platform-rewrite`
- Reused inputs:
  - `T-019 / ua-agent-lifecycle-and-trigger-design`
  - `T-021 / ua-policy-secret-scope-governance-design`

## Handoff to downstream tasks
- `T-034` consumes the runtime-facing DTOs, event rules, and persistence handoff
- `T-035` consumes operator-visible object names and API surfaces
- `T-036` consumes execution-extension object names and event ownership rules
- `T-037` consumes the removal ledger and deletion target list

## Risks & mitigations
- Risk:
  - contract redesign leaves hidden compat semantics behind
  - Mitigation:
    - maintain an explicit removal ledger and grep gate
- Risk:
  - schema planning drifts from API contracts
  - Mitigation:
    - freeze the authoritative object matrix before endpoint rewrite
- Risk:
  - downstream tasks reopen contract debates under implementation pressure
  - Mitigation:
    - treat `T-033` outputs as mandatory inputs, not advisory notes
