# 00 Overview

## Status
- State: in-progress
- Status note: `T-012` 的高影响骨架边界已冻结，可作为后续 data-plane、builder、console、connector 和 bridge 设计的共同基线；本子包仍不承接代码实现。
- Next step: 在此基线上继续细化 internal command DTO、formal event envelope 和 implementation tranche 的接口清单。

## Goal
为 `P1` 平台骨架建立一份 handoff-ready 设计基线，明确 `ingress-gateway`、`workflow-platform-api`、`workflow-runtime`、`worker` 的职责边界，以及 `/v0` 兼容接线方式和最小正式对象集。

## Non-goals
- 不编写任何 `workflow-platform-api`、`workflow-runtime`、`packages/workflow-contracts` 实现代码
- 不定义教学场景流程细节
- 不定义 Builder draft 模型或 `control-console` 页面 IA
- 不定义 connector/action layer 与 `AgentDefinition` 的完整设计

## Context
- `T-011` 已锁定全局方向：`React + Vite`、`Hybrid目标 + P1先HTTP`、`Builder 双入口 + Control Plane Draft SoT`、`Convex P4可选评估`。
- 当前 repo 仍以 `gateway + provider-sample + worker + contracts + prisma` 为统一入口基座，正式中心尚未切换到 workflow/run/artifact。
- 若平台骨架边界不先冻结，后续 `data-plane`、`builder-draft`、`teaching-scenario`、`control-console` 子包都会重复发散。

## Acceptance criteria (high level)
- [x] 文档明确给出四个核心服务的职责划分
- [x] 文档明确给出 command/query path 和 event/projection path
- [x] 文档明确给出 `P1` 最小正式对象集与状态边界
- [x] 文档明确说明 `/v0` 兼容映射与回退路径
- [x] 文档能够被后续子包直接引用，而不再重复决定平台骨架边界
