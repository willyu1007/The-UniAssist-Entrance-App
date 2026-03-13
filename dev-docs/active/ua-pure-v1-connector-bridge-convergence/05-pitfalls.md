# 05 Pitfalls

## Pitfall 1
- Problem: 用静态 sample map 暂时顶住，再把它留成长期实现。
- Prevention: dynamic loading 是显式验收项，不允许作为后补优化。

## Pitfall 2
- Problem: connector 和 bridge 各自维护独立状态机或审批账本。
- Prevention: 所有外部能力都必须回写同一套 pure-`v1` ledger。

## Pitfall 3
- Problem: 接入外部能力时重新引入 provider/executor 兼容词汇。
- Prevention: 保持 connector 和 bridge 的主线术语独立，不再复用 compat 词。
