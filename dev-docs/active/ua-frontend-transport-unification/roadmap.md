# Roadmap

## Summary
统一前端时间线传输策略，明确 SSE 为主、polling 为降级的单一运行模型，降低双通道维护成本。

## Milestones
1. 策略冻结：定义主通道与 fallback 触发条件。
2. runtime 改造：统一连接管理、重连、游标恢复。
3. 可观测支持：暴露通道状态与失败原因。
4. 兼容验证：弱网、断网、后台切前台场景验证。

## Deliverables
- 前端传输层设计说明
- 统一 transport 模块
- 兼容性测试报告
