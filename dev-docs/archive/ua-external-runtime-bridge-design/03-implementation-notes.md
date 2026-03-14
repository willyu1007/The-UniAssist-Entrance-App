# 03 Implementation Notes

## Current state
- 本子包是 coverage-completion 设计任务。
- 当前只用于补齐外部 runtime 接入边界，不进入任何 bridge 实现。

## Initial decisions
- 外部 runtime 是被纳管执行体，不是平台本身。
- callback 必须 handoff 给平台 runtime，而不是直接改正式状态。
- artifact/approval/delivery 的 authoritative objects 仍由平台维护。
- bridge registration 明确归属 executor/capability registry，而不是 connector registry。
- 首版 command set 固定为 `invoke / resume / cancel`。
- 首版 callback set 固定为 `checkpoint / result / error / approval_requested`，其他结果进入 envelope 载荷。

## Deferred decisions
- bridge protocol 是否单独拆包
- 单 bridge 还是多 bridge app 的部署形态
- bridge health / telemetry DTO
