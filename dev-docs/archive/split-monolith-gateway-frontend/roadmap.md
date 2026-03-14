# Roadmap

## Milestone
拆分 gateway/server.ts 与 frontend/app/index.tsx，保持行为冻结并完成回归。

## Workstream
1. 建立任务文档与治理追踪
2. Gateway 拆分：routing/provider-client/task-thread/auth/timeline + route registration
3. Frontend 拆分：home feature controller/view/renderer/helpers
4. 回归验证与行数验收

## Exit criteria
- apps/gateway/src/server.ts <= 350 行
- apps/frontend/app/index.tsx <= 220 行
- 新增模块单文件 <= 450 行
- gateway conformance + workspace typecheck 通过
