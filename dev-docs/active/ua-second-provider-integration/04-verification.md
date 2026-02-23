# 04 Verification

## Automated checks (planned)
- 扩展 conformance 覆盖第二专项路径
- 多专项并发路由回归测试

## Manual smoke checks (planned)
1. 第二专项命中与回包正确
2. plan + 第二专项并发时 timeline 聚合正确
3. 用户交互可按 provider/run 精确回传
4. 未命中时 fallback 仍稳定可用

## Rollout / Backout (planned)
- Rollout: 第二专项灰度启用并观察命中准确率。
- Backout: 路由开关回退为仅 `plan`。
