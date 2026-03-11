# Roadmap

## Summary
将 `gateway <-> provider` 从单 provider 特判升级为多 provider 通用编排，补齐多轮任务问答精准分发与 ready 可执行信号。

## Milestones
1. M1 协议冻结（task_question/task_state + replyToken）
2. M2 网关通用化（registry/client/重试熔断/鉴权矩阵）
3. M3 前端任务卡片与精准回复绑定
4. M4 回归验收与 staging 验证（audit/enforce）

## Deliverables
- contracts 扩展 + 兼容策略
- gateway 多 provider 通用编排框架
- provider-sample 新任务态协议实现
- frontend 任务卡片 + activeReplyToken
- conformance 与回归测试证据
