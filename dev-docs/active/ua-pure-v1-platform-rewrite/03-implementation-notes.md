# 03 Implementation Notes

## Triage decision
- Decision: `NEW_TASK`
- Rationale: 现有 `T-011` 及其派生设计任务以内含 `/v0` compatibility 前提为基础，无法作为 pure-`v1` rewrite 的 authoritative baseline。
- Mapping: `M-001 > F-001 > T-032`

## Why T-032 supersedes the old umbrella
- `T-011` 的目标是“在保留 `/v0` 兼容层前提下升级平台”，而 `T-032` 的目标是“定义并交付不考虑 `/v0` 的 pure-`v1` 平台”。
- 两者的入口模型、contract 基线、legacy 处理策略和最终命名要求均已冲突。
- 因此 `T-032` 必须成为唯一 active planning baseline，而不是 `T-011` 的附加章节。

## Task relationship matrix

| State | Tasks | Meaning | Handling in T-032 |
|---|---|---|---|
| superseded | `T-011`, `T-012`, `T-013`, `T-018`, `T-005`, `T-007` | 旧基线依赖 `/v0` 或 compat 前提，不能继续作为 pure-`v1` 决策源 | 保留为历史规划记录，不再作为 active baseline |
| reused as input | `T-014`, `T-015`, `T-019`, `T-020`, `T-021`, `T-031` | 设计结论部分可复用，但必须服从 `T-032` 的 pure-`v1` 边界 | 作为后续子流输入，不得独立覆盖 `T-032` |
| historical evidence only | `T-023`, `T-024`, `T-025`, `T-026`, `T-027`, `T-028`, `T-029`, `T-030` | 已完成或已归档的实现/验证证据 | 仅供回查，不作为当前路线的设计约束 |

## Governance note
- 本轮不强制迁移现有 active bundles 的物理位置。
- `T-032` 通过显式关系矩阵和新 registry 映射，声明自己是唯一 active planning source of truth。
- 若后续需要清理旧 active bundles 的状态或归档位置，应在单独治理任务中处理。

## Follow-on implementation queue
- `T-033 / ua-pure-v1-contract-reset`
- `T-034 / ua-pure-v1-runtime-cutover`
- `T-035 / ua-pure-v1-studio-and-agent-ops`
- `T-036 / ua-pure-v1-connector-bridge-convergence`
- `T-037 / ua-pure-v1-legacy-removal-and-identity-cleanup`

## Bundle creation note
- 在本轮治理落地中，`T-033` 到 `T-037` 已作为完整 task bundles 建立到 `dev-docs/active/`，并统一挂载到 `M-001 / F-001`。
- 这五个任务包的职责边界按以下原则冻结：
  - `T-033` 只冻结 pure-`v1` contract 和 schema baseline
  - `T-034` 交付不依赖 connector/bridge 的最小 pure-`v1` backend kernel
  - `T-035` 交付 operator/studio surface
  - `T-036` 交付 connector/bridge 与主线 ledger 的对齐
  - `T-037` 负责 legacy 删除和最终语义清扫

## Detailed bundle review note
- 在后续细化中，`T-033` 到 `T-037` 已逐包补齐：
  - admission criteria
  - scope and non-scope boundary
  - required proof loop
  - downstream handoff contract
  - package-closure review
- 这使得总包现在不仅定义“拆成哪五包”，还定义“这五包怎样才算可执行”。

## Overall execution review
- The execution chain is now intentionally asymmetric:
  - `T-033` is the semantic freeze point
  - `T-034` is the runnable-kernel and production-trigger proof point
  - `T-035` and `T-036` are post-kernel extensions that can proceed in parallel
  - `T-037` is the destructive cleanup gate
- The chain is considered executable because:
  - every task has a non-overlapping primary responsibility
  - every task has an explicit predecessor or proof dependency
  - the final cleanup task no longer carries design ambiguity
- The review also closed the two remaining coverage gaps:
  - `T-034` now explicitly owns platform-owned trigger execution infrastructure
  - `T-035` now explicitly owns the minimal operator surface for governance and external-capability control-plane objects
- Remaining caution:
  - execution should still refuse to collapse `T-035` or `T-036` back into `T-034`
  - otherwise the clean dependency split will be lost
