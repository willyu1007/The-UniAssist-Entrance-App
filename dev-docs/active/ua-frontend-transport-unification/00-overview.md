# 00 Overview

## Status
- State: in-progress
- Next step: 执行弱网/前后台切换实机冒烟并校准切换阈值。

## Goal
将前端时间线收取逻辑统一为单模型，提升稳定性与可维护性。

## Non-goals
- 不改动业务事件协议。
- 不重写 UI 渲染层。

## Context
- 当前 SSE 与 polling 逻辑并存，维护面较大。
- 需要统一重连、游标、错误处理策略。

## Acceptance criteria (high level)
- [x] 前端只保留一个 transport 抽象层。
- [x] SSE 主通道异常时可自动降级 polling。
- [ ] 恢复后可自动回到 SSE，且无重复/丢事件（待弱网实测确认）。
- [ ] 弱网与断连场景通过冒烟验证。
