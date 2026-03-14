# 01 Plan

## Objective for this task
把 connector runtime 和 external runtime bridge 收敛到已经稳定的 pure-`v1` ledger 和 governance 模型上，使外部能力成为主线的扩展层，而不是另一套并行主线。

## Admission criteria
- `T-033` 已冻结 pure-`v1` contracts and identities
- `T-034` 已交付可独立运行的 backend kernel
- `T-014` 已冻结 connector/action layer 的治理边界
- `T-020` 已冻结 bridge invoke/callback 的定位与 owner
- `T-021` 已冻结 policy/secret/scope 的治理输入

## Phases
1. External capability baseline adoption
2. Ledger convergence freeze
3. Dynamic loading and callback implementation
4. External-path proof and package closure

## Phase details
### 1. External capability baseline adoption
- Adopt `T-033` object names and `T-034` runtime ownership as mandatory inputs.
- Confirm which current external surfaces survive:
  - connector definitions and bindings
  - action bindings
  - event subscriptions
  - bridge registrations
- Exit criteria:
  - no external capability object redefines run, node, approval, artifact, or interaction identity

### 2. Ledger convergence freeze
- Freeze how the following records reconcile into one runtime ledger:
  - connector action sessions
  - connector event receipts
  - bridge invoke sessions
  - bridge callback receipts
- Freeze governance application points for:
  - `PolicyBinding`
  - `ScopeGrant`
  - `SecretRef`
- Exit criteria:
  - connector and bridge callback semantics are described as ledger extensions, not private workflows

### 3. Dynamic loading and callback implementation
- Replace hardcoded connector loading with:
  - control-plane enabled-set resolution
  - deployment-manifest resolution
  - or a combination of both, as long as runtime loading is explicit and deterministic
- Align callback handling so connector and bridge paths both:
  - authenticate
  - normalize incoming payloads
  - write to the shared runtime ledger
  - emit pure-`v1` formal events
- Exit criteria:
  - no static sample adapter map remains as the runtime ownership model

### 4. External-path proof and package closure
- Prove one connector-backed action path end to end.
- Prove one bridge-backed `external_runtime` path end to end.
- Confirm approvals, artifacts, and ledger queries stay consistent across both.
- Exit criteria:
  - external capabilities extend the kernel without reopening its contract or state ownership

## Required proof scenarios
- Connector-backed action:
  - resolve `ActionBinding`
  - invoke connector
  - receive callback or async completion
  - write shared ledger updates
  - expose artifact and run status through canonical queries
- External bridge runtime:
  - start an `external_runtime` agent run
  - create a bridge session
  - receive callback/checkpoint payloads
  - update shared run/approval/artifact state
  - expose canonical final state through the same query surface

## Dependencies
- Hard dependencies:
  - `T-033 / ua-pure-v1-contract-reset`
  - `T-034 / ua-pure-v1-runtime-cutover`
- Reused inputs:
  - `T-014 / ua-connector-action-layer-design`
  - `T-020 / ua-external-runtime-bridge-design`
  - `T-021 / ua-policy-secret-scope-governance-design`

## Handoff to downstream tasks
- `T-035` may add minimal operator views for connector/bridge state only if they fit existing route groups
- `T-037` consumes the list of external-path modules and sample assets that become deletable or renameable after convergence

## Risks & mitigations
- Risk:
  - connector and bridge each keep private callback semantics
  - Mitigation:
    - force both to reconcile against the same run ledger and governance rules
- Risk:
  - dynamic loading is deferred and static sample maps survive
  - Mitigation:
    - make removal of hardcoded adapter maps an explicit acceptance gate
- Risk:
  - external capability work reopens kernel ownership debates
  - Mitigation:
    - treat `T-034` ledger ownership as fixed and non-negotiable
