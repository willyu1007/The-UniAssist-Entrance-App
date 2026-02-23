# 00 Overview

## Status
- State: planned
- Next step: 冻结 worker 状态机与重放策略设计。

## Goal
把 worker 从“可用”提升为“高可恢复、可排障、可治理”。

## Non-goals
- 不改动业务路由策略。
- 不引入新的队列中间件。

## Context
- 当前 worker 已完成主链路，但需要完善失败治理与运维能力。
- 清理场景偶发 `NOGROUP` 日志噪音，影响排障效率。

## Acceptance criteria (high level)
- [ ] dead-letter 可重放，且具备幂等保障。
- [ ] 故障注入后可自动恢复，数据不丢失。
- [ ] `NOGROUP` 等清理竞态日志降噪完成。
- [ ] 关键异常路径具备自动化测试。
