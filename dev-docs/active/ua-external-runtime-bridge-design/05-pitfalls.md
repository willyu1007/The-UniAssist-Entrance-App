# 05 Pitfalls (do not repeat)

This file exists to prevent repeating mistakes within this task.

## Do-not-repeat summary (keep current)
- 不要把平台写成某个外部 runtime 的控制壳。
- 不要让 callback 直接拥有 workflow state transition 主权。
- 不要让外部 runtime 直接记账 authoritative artifact/approval。
- 不要把 external runtime bridge 混进 connector registry。
- 不要一开始把 callback 类型扩展成过多细粒度事件。
