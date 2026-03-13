# 01 Plan

## Objective for this task
交付一个真正可运行的 pure-`v1` backend kernel，并把运行闭环证明建立在平台原生能力和平台拥有的 production trigger infrastructure 上，而不是借 connector、bridge、gateway 或控制台绕过核心问题。

## Admission criteria
- `T-033` 已冻结 pure-`v1` contract、identity、resume 和 persistence handoff
- `T-019` 已提供 agent/trigger 生命周期输入
- `T-021` 已提供 approval/policy/secret/scope 治理输入
- `T-006` 的内部服务鉴权要求继续适用于 platform/runtime/worker

## Phases
1. Contract adoption and service-boundary freeze
2. Minimal executable kernel implementation
3. Query, cancel, and continuation closure
4. Runtime proof and package closure

## Phase details
### 1. Contract adoption and service-boundary freeze
- Replace compat-shaped DTO usage with `T-033` outputs in:
  - `workflow-platform-api`
  - `workflow-runtime`
  - `worker`
  - `trigger-scheduler`
- Freeze command/query/event ownership before refactor:
  - start/cancel/query entry points
  - schedule and webhook trigger dispatch
  - approval decision and interaction response
  - formal event production
  - continuation dispatch and retries
- Exit criteria:
  - no service boundary still depends on gateway/provider semantics for mainline execution

### 2. Minimal executable kernel implementation
- Implement one platform-native execution path that proves:
  - `agent-first` run start
  - platform-owned trigger start for schedule or webhook trigger
  - node progression without connector or bridge
  - artifact emission
  - approval blocking and resume
  - interaction blocking and resume
  - completion, failure, and cancel state transitions
- The native execution path may be minimal, but it must be production-shaped enough to validate:
  - command routing
  - runtime state ownership
  - ledger persistence
  - formal event emission
- Add one minimal compat fixture that exists only to make interaction recovery testable while the native proof path is being landed:
  - it MUST deterministically emit a real interaction block
  - it MUST allow resume by `interactionRequestId`
  - it SHOULD also be able to force the `task_state.ready + require_user_confirm` continuation edge if that edge still exists during cutover
  - it MUST stay quarantined as a test/proof harness, not a dependency of the authoritative contract or kernel architecture
- Exit criteria:
  - the platform can execute and finish a run without any `/v0`, gateway, connector, or bridge dependency

### 3. Query, cancel, and continuation closure
- Rework query surfaces required by later tasks:
  - run list/detail
  - approval detail
  - artifact detail/list
  - trigger binding status and dispatch visibility needed by operators
  - operator-facing lifecycle status
- Rework worker behavior so it only handles:
  - continuation
  - retries
  - outbox dispatch
  - downstream projection fan-out
- Rework trigger infrastructure so platform-owned triggers use pure-`v1` dispatch paths:
  - due-schedule polling and dispatch
  - webhook runtime-config lookup and verified dispatch
- Remove worker reliance on gateway projection endpoints for mainline correctness.
- Exit criteria:
  - query surfaces are sufficient for `T-035`
  - continuation and trigger dispatch no longer assume gateway ownership

### 4. Runtime proof and package closure
- Run an end-to-end proof scenario that exercises:
  - start
  - trigger-fired start
  - native node execution
  - artifact emission
  - approval pause/resume
  - interaction pause/resume
  - completion
- Use the minimal compat fixture as a bounded proof harness wherever the current repo still lacks a stable native interaction fixture.
- Confirm failure and cancel paths as part of the same kernel ownership model.
- Exit criteria:
  - `T-035` and `T-036` can treat the backend kernel as a stable dependency rather than an unfinished scaffold

## Required proof scenario
- Start a run from `agentId` with structured input.
- Start a run from one platform-owned trigger path:
  - due schedule trigger
  - or webhook trigger
- Execute at least one platform-native node that mutates run state.
- Emit at least one artifact.
- Pause on one approval request and resume by `approvalRequestId`.
- Pause on one interaction request and resume by `interactionRequestId`.
- Use the minimal compat fixture to force at least one deterministic interaction-recovery path when platform-native fixtures are not yet sufficient for repeatable testing.
- Complete the run and expose queryable final state.

## Dependencies
- Hard dependency:
  - `T-033 / ua-pure-v1-contract-reset`
- Reused inputs:
  - `T-019 / ua-agent-lifecycle-and-trigger-design`
  - `T-021 / ua-policy-secret-scope-governance-design`
  - `T-006 / ua-v1-internal-security`

## Handoff to downstream tasks
- `T-035` consumes stable operator-facing queries, trigger status, run lifecycle states, approvals, artifacts, and debug entry semantics
- `T-036` consumes stable runtime ledger ownership, formal events, and continuation behavior
- `T-037` consumes the final list of gateway/compat runtime code paths that become deletable after cutover

## Risks & mitigations
- Risk:
  - task becomes a rename-only refactor with no runnable kernel
  - Mitigation:
    - require a non-connector, non-bridge executable path in acceptance
- Risk:
  - interaction recovery remains untestable because the repo lacks a stable fixture that can reliably emit the blocking state
  - Mitigation:
    - require a minimal compat fixture inside `T-034` as temporary proof infrastructure, with explicit quarantine from authoritative contracts
- Risk:
  - runtime and platform API boundaries drift during cutover
  - Mitigation:
    - freeze command/query/event ownership before implementation starts
- Risk:
  - worker stays coupled to gateway projection semantics
  - Mitigation:
    - make gateway-independence part of the exit criteria for mainline correctness
- Risk:
  - trigger bindings remain control-plane records only, without a production-ready execution path
  - Mitigation:
    - require at least one platform-owned trigger proof path as part of kernel completion
