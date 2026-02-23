# 00 Overview

## Status
- State: planned
- Next step: 先冻结 staging 发布门禁的最小验收标准。

## Goal
把 UniAssist v0 的 gateway/worker/provider/adapter 链路沉淀为可复现的 Staging 发布基线。

## Non-goals
- 本任务不引入新业务能力。
- 本任务不替代生产级安全改造（JWT/内部签名另任务推进）。

## Context
- 代码链路已具备本地可运行能力。
- 当前缺少“可重复发布+可回滚+可门禁”的标准流程。

## Acceptance criteria (high level)
- [ ] Staging runbook 完整覆盖发布与回滚。
- [ ] 发布前门禁包含 conformance + redis e2e smoke。
- [ ] 发布后健康检查与关键链路验收可自动执行。
- [ ] 出现异常时可在 15 分钟内回滚到上个稳定版本。
