# 01 Plan

## Phases
1. Phase 0: 文档与治理准备
2. Phase 1: Gateway 拆分与校验
3. Phase 2: Frontend 拆分与校验
4. Phase 3: 全量验证与收尾

## Detailed steps
- 创建任务包并同步 project governance。
- Gateway:
  - 抽离 routing 纯逻辑
  - 抽离 provider client（重试/熔断/manifest）
  - 抽离 task thread 管理
  - 抽离 auth guard 与签名校验
  - 抽离 timeline/event 存取与 SSE 客户端管理
  - 拆分 route handlers，server.ts 仅保留装配
- Frontend:
  - 新建 `src/features/home`
  - 提取 types/constants/helpers
  - 提取 controller hook（状态+网络+交互）
  - 提取 interaction renderer 与 page view
  - `app/index.tsx` 收敛为薄入口
- 每阶段执行 typecheck / conformance 并记录。

## Risks & mitigations
- Risk: 抽离时遗漏共享状态导致行为漂移
- Mitigation: 使用 dependency factory + 保持旧分支逻辑逐段迁移
- Risk: 导入路径改动引入循环依赖
- Mitigation: 单向依赖（routes -> services -> shared utils）
- Risk: 前端交互渲染分支回归
- Mitigation: 渲染逻辑原样搬迁并保留同名 handler 流程
