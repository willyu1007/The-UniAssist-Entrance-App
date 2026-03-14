# 01 Plan

## Objective for this task
把 pure-`v1` 主线对象变成可被运维者和设计者直接操作的 control-console surface，同时补齐运行 pure-`v1` 所需的最小 governance / connector / bridge operator 管理面，并严格限制 UI 只消费已经冻结的 contract 和 kernel。

## Admission criteria
- `T-034` 已提供稳定的 run/approval/artifact/query/cancel semantics
- `T-015` 仍作为 control-console 信息架构和页面分组的设计输入
- `T-014` 和 `T-020` 提供 connector/bridge control-plane 对象边界
- `T-019` 和 `T-021` 已冻结 agent/governance 对象方向
- control-console 仍只通过 `workflow-platform-api` 访问系统

## Phases
1. Operator surface freeze
2. Query and mutation contract alignment
3. Control-console route and state implementation
4. Operator proof and package closure

## Phase details
### 1. Operator surface freeze
- Freeze the operator personas and their core jobs:
  - workflow author
  - agent operator
  - capability operator
  - governance operator
  - approval actor
  - run investigator
- Freeze the route groups:
  - templates and published versions
  - drafts and revisions
  - agents and trigger bindings
  - connectors and bridge registrations
  - governance bindings and requests
  - runs, approvals, and artifacts
  - studio/debug
- Exit criteria:
  - every route group maps to a pure-`v1` object family
  - no route group is justified by gateway/chat/provider concepts

### 2. Query and mutation contract alignment
- Align operator actions to canonical API surfaces:
  - draft create/focus/edit/validate/publish
  - agent create/activate/suspend/retire
  - trigger binding create/list
  - connector definition and connector binding list/create/detail
  - action binding and event subscription inspection/creation paths
  - bridge registration list/create/activate/suspend
  - policy binding list/create
  - secret ref list/create
  - scope grant inspection
  - governance change request list/create/approve/reject
  - run list/detail/cancel
  - approval list/detail/decision
  - artifact detail/list
  - manual/debug start with explicit non-production semantics
- Clarify which existing draft-intake or synthesize endpoints survive as authoring helpers and which are removed as builder/chat residue.
- Exit criteria:
  - operator actions do not require reopening `T-033` or `T-034`
  - every console mutation has a single authoritative API owner

### 3. Control-console route and state implementation
- Implement route-level screens, data fetching, and action state against `workflow-platform-api`.
- Preserve the repo rule that Convex or other projections remain optional read optimizations only.
- Ensure the console remains usable if projection adapters fall back to authoritative APIs.
- Exit criteria:
  - no console path depends on direct runtime, DB, Redis, or gateway access

### 4. Operator proof and package closure
- Prove the operator can complete the mainline loop:
  - author or update a draft
  - publish a version
  - create or activate an agent
  - configure the minimal connector/bridge/governance prerequisites needed for a managed agent
  - inspect or launch a debug/manual run
  - inspect run state and artifacts
  - review and decide an approval
- Exit criteria:
  - the system is operable through control-console and API surfaces alone for pure-`v1` mainline flows

## Required operator proof
- A user can navigate from draft to published version to agent activation.
- A user can create or inspect the connector/bridge/governance objects required to operate a pure-`v1` agent without dropping to raw APIs.
- A user can inspect a run and its artifacts without leaving the console.
- A user can resolve a pending approval through the console.
- A user can start a manual/debug run without that path becoming the primary production entry model.

## Dependencies
- Hard dependency:
  - `T-034 / ua-pure-v1-runtime-cutover`
- Reused inputs:
  - `T-015 / ua-control-console-foundation-design`
  - `T-014 / ua-connector-action-layer-design`
  - `T-020 / ua-external-runtime-bridge-design`
  - `T-019 / ua-agent-lifecycle-and-trigger-design`
  - `T-021 / ua-policy-secret-scope-governance-design`

## Handoff to downstream tasks
- `T-036` consumes any operator-facing connector/bridge views that are genuinely required, but it must stay subordinate to the existing route groups
- `T-037` consumes the list of console paths, labels, and helper APIs that still expose legacy naming or entry assumptions

## Risks & mitigations
- Risk:
  - control-console drifts into a full admin platform too early
  - Mitigation:
    - keep route groups aligned to operator-critical objects only
- Risk:
  - studio reintroduces chat/builder semantics by convenience
  - Mitigation:
    - explicit non-goal: no chat intake, no gateway-style entry
- Risk:
  - optional projection layers quietly become authoritative
  - Mitigation:
    - every view must function against authoritative API fallback
- Risk:
  - governance and external capability objects stay API-only, forcing operators back to raw endpoints
  - Mitigation:
    - make the minimal management surface for those objects an explicit acceptance criterion
