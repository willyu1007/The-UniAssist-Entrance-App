# 03 Implementation Notes

## Status
- Current status: `in-progress`
- Last updated: 2026-02-23

## What changed
- 新增统一 transport 抽象：
  - `apps/frontend/src/transport/timelineTransport.ts`
  - 提供 `TimelineTransport`（SSE 主 + polling fallback + 自动恢复）
  - 内置状态机：`connecting/open/degraded/recovering/closed`
  - 统一 cursor 推进与事件回调
  - SSE stale watchdog（默认 15s）与最小驻留时间（默认 8s）
- 首页接入 transport：
  - `apps/frontend/app/index.tsx`
  - 移除页面内独立 polling loop，改为 transport 单入口
  - `ingest/interact` 后统一触发 `transport.syncNow()`
  - 增加 transport 状态可视化条（mode/state/cursor）

## Decisions & tradeoffs
- Decision:
  - 优先使用 SSE，仅在运行环境提供 `EventSource` 时启用；否则直接 polling。
  - Rationale:
    - Expo/RN 运行环境差异较大，先保证所有端可运行，再利用 SSE 提升实时性。
  - Tradeoff:
    - 原生端若无 `EventSource`，实时性上限由 polling 间隔决定。

- Decision:
  - 去重仍由页面层 `eventId` 集合处理，transport 只负责统一收取与 cursor 推进。
  - Rationale:
    - 降低 transport 与渲染层耦合，避免重复状态源。
  - Tradeoff:
    - 页面侧仍需维护去重状态，后续可下沉到 transport 做二次封装。

## Known issues / follow-ups
- TODO: 执行弱网/断网/前后台切换冒烟，确认无重复/丢事件。
- TODO: 评估在 RN 端引入稳定 SSE polyfill，减少 polling 常驻场景。

## Pitfalls / dead ends (do not repeat)
- Keep the detailed log in `05-pitfalls.md` (append-only).
