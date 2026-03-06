# 00 Overview

## Status
- State: done
- Next step: T-007 在此框架上接入第二专项 provider。

## Goal
构建多 provider 通用交互编排与任务态协议，实现多轮问答精准分发及 `ready -> execute` 编排。

## Non-goals
- 不交付真实第二专项业务能力（由 T-007 后续接入）
- 不引入外部 IdP / OAuth
- 不建设医疗策略中心

## Context
- 当前 gateway 对 provider 调用仍以 `plan` 特判为主。
- 多 provider 并发问答场景下缺少 reply 绑定，存在误分发风险。
- provider 缺少显式 `ready` 信号，网关无法稳定编排执行阶段。

## Acceptance criteria (high level)
- [x] 多 provider 场景下消息分发无串线，`replyToken` 命中率 100%
- [x] provider 可显式发送 `task_state=ready`，网关按 `executionPolicy` 执行
- [x] 鉴权矩阵改为 registry 驱动，去除 provider-plan 硬编码
- [x] 调用链具备统一重试/熔断/错误语义，现有 v0 回归通过
