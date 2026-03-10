# 03 Implementation Notes

## Current state
- 本子包是 coverage-completion 设计任务。
- 当前只用于补齐治理核心边界，不进入任何 secret/policy 实现。

## Initial decisions
- 高风险动作必须有正式 governance request。
- runtime、connector、external runtime 都不是 secret/policy authority。
- scope grant 必须可撤销、可过期、可审计。
- 不新建第二套 `GovernanceRequest / GovernanceDecision` 账本，继续复用 `ApprovalRequest / ApprovalDecision`。
- `PolicyBinding` 首版采用统一外壳，由 `policy_kind` 区分语义。
- `SecretRef` 首版采用 `workspace` 主权 + `environment overlay`。

## Deferred decisions
- `ScopeGrant` 的进一步细分粒度
- control-console 治理页的最终信息架构
