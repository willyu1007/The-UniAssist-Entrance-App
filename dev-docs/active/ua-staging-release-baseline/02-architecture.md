# 02 Architecture

## Scope boundaries
- In scope:
  - Staging 部署流程与发布门禁
  - 环境配置基线
  - 回滚流程
- Out of scope:
  - 新功能开发
  - 生产级流量策略

## Runtime interfaces
- Health: `/health`
- Core: `/v0/ingest` `/v0/interact` `/v0/stream` `/v0/timeline`
- Channel: `/wechat/webhook`

## Deployment sequence
1. 校验配置与依赖可达
2. 启动 provider 与 adapter
3. 启动 gateway
4. 启动 worker
5. 执行门禁测试

## Key risks
- 配置漂移
- 数据迁移失败
- worker 启动失败导致 outbox 堆积
