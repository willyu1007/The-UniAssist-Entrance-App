# 00 Overview

## Status
- State: done
- Next step: 可执行 archive/handoff 流程。

## Goal
将 gateway 与 frontend 两个超大单体文件拆分为可维护模块，保证行为与公共接口不变。

## Non-goals
- 不引入新功能
- 不修改 contracts / DB schema / env contract
- 不变更外部 API 路由与 wire shape

## Context
- `apps/gateway/src/server.ts` 2117 行，集成了状态、路由、鉴权、provider 调用与事件总线。
- `apps/frontend/app/index.tsx` 1234 行，混合状态管理、网络交互和复杂渲染逻辑。
- 代码可运行，但维护成本高，变更风险集中。

## Acceptance criteria (high level)
- [x] 两个目标文件降到阈值内
- [x] gateway conformance 无回归
- [x] frontend typecheck 无回归
- [x] 关键行为（pending task、switch、voice、timeline）一致
