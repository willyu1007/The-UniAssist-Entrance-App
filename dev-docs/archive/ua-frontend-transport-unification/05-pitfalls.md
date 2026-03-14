# 05 Pitfalls

## Do-not-repeat summary
- 不要在页面层继续并存多个独立 polling 循环，容易出现 cursor 竞争与重复渲染。

## Resolved issues log
- 2026-02-23: 首页直接维护 polling timer，导致 transport 逻辑分散。
  - Fix: 统一到 `TimelineTransport` 模块，页面只处理事件渲染与去重。
