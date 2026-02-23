# 02 Architecture

## Scope boundaries
- In scope:
  - 前端 timeline transport 层
- Out of scope:
  - 后端事件协议改造

## Transport model
- Primary: SSE `/v0/stream`
- Fallback: Polling `/v0/timeline`
- Recovery: polling 稳定后尝试回切 SSE

## Data consistency
- `cursor` 作为主进度
- `eventId` 作为去重键
- session 维度独立状态

## Key risks
- 网络抖动引起状态机震荡
- App 生命周期切换导致连接泄漏
