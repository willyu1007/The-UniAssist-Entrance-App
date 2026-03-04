# 05 Pitfalls

## Do-not-repeat summary
- 不要并发执行会写同一配置文件的 `ctl-deploy add-service` 命令。

## Resolved issues log
- 2026-03-04: 并发执行多个 `add-service` 导致 `ops/deploy/config.json` 写覆盖，`worker` service 条目丢失。
  - Fix: 顺序重跑 `add-service --id worker ...`。
  - Guardrail: 涉及共享 JSON 持久化的命令统一串行执行。
