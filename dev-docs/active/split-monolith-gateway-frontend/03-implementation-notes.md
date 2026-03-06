# 03 Implementation Notes

## 2026-03-06
- 初始化任务包与执行计划。
- Scope 锁定为仅拆分两个超大文件（backend + frontend）。
- 完成 Gateway 拆分：
  - 新增 services/modules：routing、provider-client、task-thread、auth、timeline、sessions、user-context。
  - 新增 routes modules：ingest/interact/events/basic/timeline-context。
  - `apps/gateway/src/server.ts` 收敛为依赖装配 + middleware + route registration + lifecycle。
  - 保持原 API 路径与 payload 语义不变。
- 完成 Frontend 拆分：
  - 新增 `src/features/home/`，拆分为 controller、view、interaction renderer、local flow、ui/voice handlers、types/constants/helpers。
  - `apps/frontend/app/index.tsx` 收敛为薄入口。
- 代码质量修复（review follow-up）：
  - 修复 `useHomeUiHandlers` / `useHomeVoiceHandlers` 的不稳定依赖（从 `[params]` 改为显式依赖列表）。
  - 移除 `InteractionBody.tsx` 未使用导入。
  - 收紧 `ProviderRegistryEntry.manifest` 类型为 `ProviderManifest`。
- 结构验收：
  - `apps/gateway/src/server.ts`: 2117 -> 192 行
  - `apps/frontend/app/index.tsx`: 1234 -> 9 行
  - 新增拆分模块最大 449 行（`useHomeController.ts`）
