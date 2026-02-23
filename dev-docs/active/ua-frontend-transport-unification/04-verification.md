# 04 Verification

## Automated checks
- Executed (2026-02-23):
  - `pnpm --filter @baseinterface/frontend typecheck` -> PASS

## Manual smoke checks
- Planned:
1. 正常网络 SSE 长连接稳定（Web 端）
2. 强制断网后自动降级 polling
3. 网络恢复后回切 SSE，并验证无重复/丢事件
4. 前后台切换后连接状态正确（移动端）

## Rollout / Backout
- Rollout:
  - 先在测试用户启用 transport 状态可视化，观察切换稳定性。
  - 稳定后关闭旧 polling 入口代码路径（本次已完成）。
- Backout:
  - 如果出现切换抖动，临时将 transport 固定为 polling 模式（关闭 SSE 尝试）。
