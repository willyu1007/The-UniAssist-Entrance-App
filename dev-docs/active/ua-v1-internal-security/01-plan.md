# 01 Plan

## Phases
1. 安全需求与边界定义
2. 中间件与协议实现
3. scope 模型与配置
4. 安全测试与发布

## Detailed steps
- 定义服务身份（gateway/worker/provider/adapter）。
- 设计 JWT claims 与签名算法。
- 在关键接口添加认证与授权拦截。
- 落实拒绝路径的错误码与审计日志。
- 演练密钥轮换与失效恢复。

## Risks & mitigations
- Risk: 认证改造影响现网联调。
- Mitigation: 灰度启用并保留兼容窗口。
- Risk: scope 设计过粗或过细。
- Mitigation: 先基于最小可用矩阵，后续迭代。
