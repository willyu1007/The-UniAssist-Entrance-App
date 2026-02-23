# 04 Verification

## Automated checks (planned)
- 认证中间件单测
- scope 授权矩阵测试
- 失效 token/签名回归测试

## Manual smoke checks (planned)
1. 未授权调用被拒绝
2. 低权限 scope 无法访问高权限接口
3. 密钥轮换后新旧 token 在窗口内行为符合预期

## Rollout / Backout (planned)
- Rollout: 先 audit-only 再 enforce。
- Backout: 切回兼容模式并保留审计日志。
