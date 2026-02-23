# 02 Architecture

## Scope boundaries
- In scope:
  - 第二真实 provider 接入
  - gateway 路由与前端聚合适配
- Out of scope:
  - 专项内部复杂业务流程

## Integration points
- Provider manifest: `/.well-known/uniassist/manifest.json`
- Provider APIs: `/v0/invoke` `/v0/interact`
- Gateway APIs: `/v0/ingest` `/v0/interact` `/v0/timeline`

## Data flow
1. gateway 路由出 Top2
2. 并发触发 plan + second provider
3. interaction 聚合到单时间线
4. 用户交互回传指定 provider/run

## Key risks
- provider SLA 差异导致交互节奏不一致
- 多 provider extension 渲染冲突
