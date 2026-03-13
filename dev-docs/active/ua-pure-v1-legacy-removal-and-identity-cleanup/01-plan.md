# 01 Plan

## Objective for this task
在 pure-`v1` 主线已经被前置任务证明可用之后，执行一次不可逆的 legacy 删除和 identity 清扫，确保 active repo 不再保留任何语义漂移的 compat 名称、模块或入口。

## Admission criteria
- `T-033` 已冻结 pure-`v1` contracts and removal ledger
- `T-034` 已证明 pure-`v1` backend kernel 可独立运行
- `T-035` 已证明 operator-critical flows 可在 control-console 上完成
- `T-036` 已证明 connector/bridge 扩展可挂接到 shared ledger
- 需要删除的 legacy surfaces 已形成 inventory

## Phases
1. Legacy inventory and backup freeze
2. Destructive module and data removal
3. Identity and naming cleanup
4. Final grep, governance, and build gate

## Phase details
### 1. Legacy inventory and backup freeze
- Inventory all legacy surfaces:
  - legacy tables and columns
  - `/v0` APIs
  - gateway/frontend/provider legacy modules
  - compat contracts and sample aliases
  - docs/scripts/tests referencing old semantics
  - workspace metadata and package names carrying old identity
- Produce one backup/export pass for legacy data and retain evidence.
- Define where historical references may still exist after cleanup:
  - backup artifacts
  - archived task bundles
  - changelog or historical migration notes when necessary
- Exit criteria:
  - every destructive target is named
  - every allowed historical exception path is named

### 2. Destructive module and data removal
- Remove legacy service and package roots once pure-`v1` replacement is proven.
- Remove legacy tables and compat persistence columns once backup evidence exists.
- Delete obsolete tests and scripts that only validate `/v0` or provider-centric semantics.
- Exit criteria:
  - no active runtime path depends on legacy modules or data shapes

### 3. Identity and naming cleanup
- Sweep:
  - package names
  - script names
  - environment variable names where rename is required
  - doc language in README/AGENTS/active task bundles
  - sample/helper names that still encode compat/provider semantics
- Rewrite or delete references until no active mainline path still describes the platform in legacy terms.
- Exit criteria:
  - active repo language matches pure-`v1` semantics

### 4. Final grep, governance, and build gate
- Run explicit grep gates for forbidden terms across active paths.
- Run governance sync/lint after archival or status changes caused by cleanup.
- Run mainline build/test validation required to prove the repo still functions after deletions.
- Exit criteria:
  - grep gates pass
  - governance passes
  - mainline validation passes

## Required final grep gate
- Forbidden terms in active code/docs/scripts/workspace metadata:
  - `/v0`
  - `compatProviderId`
  - `WorkflowEntryRegistryEntry`
  - `replyToken`
  - `provider_run`
  - `providerId` where it encodes workflow identity semantics
- Allowed exceptions only in:
  - backup/export evidence for this task
  - `dev-docs/archive/**`
  - narrowly scoped migration notes that are explicitly historical

## Dependencies
- Hard dependencies:
  - `T-033`
  - `T-034`
  - `T-035`
  - `T-036`
- Reused inputs:
  - `T-032 / ua-pure-v1-platform-rewrite`

## Risks & mitigations
- Risk:
  - partial deletion leaves hidden compat aliases behind
  - Mitigation:
    - use an explicit grep gate and inventory checklist
- Risk:
  - destructive cleanup happens before pure-`v1` replacement is proven
  - Mitigation:
    - require all predecessor acceptance criteria before start
- Risk:
  - repo-level docs keep describing a compatibility product direction after code removal
  - Mitigation:
    - treat README/AGENTS/workspace metadata as first-class cleanup targets
