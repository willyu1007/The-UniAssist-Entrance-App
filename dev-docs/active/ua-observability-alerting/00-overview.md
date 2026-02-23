# 00 Overview

## Status
- State: planned
- Next step: 先冻结首批必须可观测的指标与告警门槛。

## Goal
让 UniAssist 的运行状态可被量化观测，并能在异常时自动告警到人。

## Non-goals
- 不做复杂 BI 报表。
- 不引入与当前阶段不匹配的全量 APM 改造。

## Context
- 当前已有功能闭环，但排障主要依赖人工日志。
- 需要建立指标驱动的稳定性治理基础。

## Acceptance criteria (high level)
- [ ] gateway/worker/provider 输出统一结构化日志。
- [ ] 关键指标可查询：ingest 延迟、outbox backlog、retry/dead_letter、错误率。
- [ ] 至少 3 条 P1/P2 告警可用并经过演练。
- [ ] 提供故障排查 runbook 并经过一次实战验证。
