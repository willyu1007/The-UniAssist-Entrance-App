# 05 Pitfalls

## Pitfall 1
- Problem: 继续把 `T-011` 或其兼容前提当作当前 rewrite 的隐式母任务。
- Prevention: 所有 pure-`v1` 后续任务必须引用 `T-032`，不得以 `T-011` 为设计基线。

## Pitfall 2
- Problem: 在 planning/governance 任务中顺手实现产品代码，导致决策和实现耦合。
- Prevention: `T-032` 只允许治理和文档资产变更；代码实现必须进入 `T-033` 到 `T-037`。

## Pitfall 3
- Problem: 在 active mainline docs 中保留 compat 术语，导致后续任务继续沿用漂移语义。
- Prevention: `T-032` 文档必须显式写出移除概念清单，并将 compat 词汇限制为历史说明。

## Pitfall 4
- Problem: 让 superseded 与 reused-as-input 的旧任务继续平级发散，形成多个规划源。
- Prevention: 任何后续规划分歧都以 `T-032` 为准；旧任务只可被引用，不可覆盖。
