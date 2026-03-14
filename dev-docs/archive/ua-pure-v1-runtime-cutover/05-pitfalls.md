# 05 Pitfalls

## Pitfall 1
- Problem: 让 connector 或 bridge 成为 kernel 可运行性的前提。
- Prevention: `T-034` 的 acceptance 必须独立于 `T-036` 成立。

## Pitfall 2
- Problem: 继续保留 provider/gateway-shaped runtime entry。
- Prevention: 本任务只允许 agent-first mainline entry。

## Pitfall 3
- Problem: 用 projection 或 convenience DTO 替代 authoritative run ledger。
- Prevention: 所有 blocking、artifact、approval、completion 语义都必须直接绑定 pure-`v1` ledger。
