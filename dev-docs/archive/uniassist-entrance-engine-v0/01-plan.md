# 01 Plan

## Phases
1. Contract freeze（types + schemas）
2. Gateway core（ingest/interact/stream/events/context）
3. Frontend runtime（时间线来源标签 + provider_extension 渲染 + 切换芯片）
4. WeChat adapter skeleton（入站归一化 + 文本回传）
5. Verification & hardening（typecheck + smoke）

## Detailed steps
- 创建 `packages/contracts`：
  - 定义统一模型：`UnifiedUserInput`、`ContextPackage`、`InteractionEvent`、`TimelineEvent` 等
  - 补充扩展事件：`data_collection_request/progress/result`
  - 增加 JSON schema 文件与导出清单
- 创建 `apps/gateway`：
  - 实现 v0 API 路由与内存态事件存储（v0 最小闭环）
  - 实现 fallback 逻辑、sticky provider 权重、session 自动切分规则
  - 实现 SSE stream 与 profileRef 上下文拉取接口
  - 加入外部入口签名校验中间件
- 改造 `apps/frontend`：
  - 接入 timeline event 渲染模型
  - 增加来源标签、建议切换芯片、会话菜单二级入口
  - 增加 provider_extension 渲染器（JSONSchema+uiSchema 结构展示）
- 创建 `apps/adapter-wechat`：
  - 入站 webhook -> 归一化 -> 调用 gateway ingest
  - 文本回传 skeleton 与签名校验
- 执行验证：
  - typecheck（root/frontend/gateway/contracts/adapter）
  - 基本 API smoke（ingest/fallback/stream/interact/context）

## Risks & mitigations
- Risk:
  - 范围较大导致一次性改动过多
  - Mitigation:
    - 先保证 contracts+gateway 可运行，再做 frontend 与 adapter 适配
- Risk:
  - 前端与后端契约不一致
  - Mitigation:
    - 前后端共享 `@baseinterface/contracts`，禁止重复定义核心类型
- Risk:
  - 会话分割规则导致误切分
  - Mitigation:
    - 规则参数化并保守默认，提供手动新建入口兜底
