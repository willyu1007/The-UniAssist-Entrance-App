# 04 Verification

## Automated checks (planned)
- transport 状态机单测
- cursor/eventId 去重单测

## Manual smoke checks (planned)
1. 正常网络 SSE 长连接稳定
2. 强制断网后自动降级 polling
3. 网络恢复后回切 SSE
4. 前后台切换后连接状态正确

## Rollout / Backout (planned)
- Rollout: 先在测试用户启用新 transport。
- Backout: 保留旧 transport 开关，一键回退。
