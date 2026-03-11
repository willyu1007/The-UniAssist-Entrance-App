# 01 Plan

## Phases
1. Phase 0: 合同与状态机冻结
2. Phase 1: Gateway provider registry + client 通用化
3. Phase 2: 任务线程持久化与精准分发
4. Phase 3: Provider-plan + Frontend 适配
5. Phase 4: 测试与验收

## Detailed steps
- 扩展 contracts：`task_question`、`task_state`、`replyToken/inReplyTo`。
- 引入 provider registry（allowlist + manifest 拉取）与统一 provider client。
- 新增 task thread 存储与 pending question 路由优先级。
- `/v0/events` 与 `/v0/context` 的 allowedSubjects 改为 registry 驱动。
- provider-sample 支持多轮提问、ready 信号与 execute 动作。
- frontend 增加任务卡片渲染与 activeReplyToken 绑定发送。
- 更新 conformance 与回归脚本，记录 staging 验证证据。

## Risks & mitigations
- Risk: 合同升级导致旧事件不可用。
- Mitigation: 网关入站做旧事件归一化，保留一个版本兼容窗口。
- Risk: 重试与熔断引入行为复杂度。
- Mitigation: 固定参数（5s, 3 次, 300/900+jitter, 5 次失败开路 30s）。
- Risk: T-007 与 T-009 并行冲突。
- Mitigation: T-007 标记 blocked，待 T-009 完成后接入。
