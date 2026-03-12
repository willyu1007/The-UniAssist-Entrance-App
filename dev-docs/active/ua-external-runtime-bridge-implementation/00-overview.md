# 00 Overview

## Status
- State: done
- Status note: `B6` 首版与 review remediation 已完成：补齐 bridge metadata validator、callback scope 校验、approval-gate cancel 语义、callback receipt 首写不可变，以及 repo Prisma baseline migration / DB context。
- Next step: 在明确目标环境与风险接受后，执行实际数据库 baseline/apply；真实厂商 bridge 适配与 control-plane 扩展仍由后续任务包承接。

## Goal
实现 `T-011 / B6` 的 external runtime bridge：让 agent 可以绑定 bridge，并通过受治理的 bridge registration、agent run 启动、invoke/resume/cancel、normalized callback 完成对外部 runtime 的接入。

## Non-goals
- 不实现 connector runtime / event bridge
- 不把 bridge 直接做成通用 executor registry
- 不新增 control-console 页面
- 不绑定任何真实厂商 runtime
- 不让 external runtime 直接写正式 artifact / approval / delivery store

## Context
- `T-020` 已冻结：external runtime bridge 属于 executor/capability 体系，不属于 connector registry。
- `T-027 / B5` 已落地 `AgentDefinition.executorStrategy=external_runtime`，但还没有实际 bridge registration、agent binding 与 runtime invoke/callback path。
- 当前 `workflow-runtime` 仅支持基于 `compat provider` 的同步 invoke/interact；B6 将在不破坏该路径的前提下新增 external runtime 分支。

## Acceptance criteria (high level)
- [x] 建立独立 `B6` task bundle 并同步 project governance
- [x] `packages/workflow-contracts` 与 `packages/executor-sdk` 补齐 bridge registration、command/callback、agent run/cancel contract
- [x] `prisma/schema.prisma` 补齐 bridge registration 与 bridge session / callback ledger
- [x] `apps/workflow-platform-api` 提供 bridge-specific northbound API、agent bridge binding 校验、agent run start、run cancel
- [x] `apps/workflow-runtime` 提供 external runtime invoke/resume/cancel 与 callback ingress
- [x] 新增 `apps/executor-bridge-sample` 样例 bridge，并完成 targeted tests + smoke
