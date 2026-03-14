# 05 Pitfalls

## Do-not-repeat
- 不要把 builder state 塞回 `taskThread`；draft 不是 runtime task。
- 不要让 `POST /v1/workflows` 和 `draft -> publish` 并存为两个正式入口。
- 不要在 B2 提前实现 runtime capture -> `RecipeDraft`，那属于 `B3`。
- 不要在未获单独批准时直接执行 target DB schema apply；本任务只更新 repo SSOT 与 context contract。
