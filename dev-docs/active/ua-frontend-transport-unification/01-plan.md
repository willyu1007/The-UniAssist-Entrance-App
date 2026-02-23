# 01 Plan

## Phases
1. 现状梳理与状态机设计
2. transport 模块实现
3. 错误处理与回退策略实现
4. 端到端兼容性验证

## Detailed steps
- 统一事件游标管理与去重逻辑。
- 设计连接状态（connecting/open/degraded/recovering/closed）。
- 为 SSE 加入超时与心跳策略。
- polling 仅作为 fallback 路径。
- 提供调试视图展示当前通道状态。

## Risks & mitigations
- Risk: 通道切换导致重复事件。
- Mitigation: 统一 cursor + eventId 去重。
- Risk: 弱网下频繁切换抖动。
- Mitigation: 增加退避与最小驻留时间。
