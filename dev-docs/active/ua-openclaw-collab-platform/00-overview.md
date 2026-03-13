# 00 Overview

## Status
- State: in-progress
- Status note: `T-011` 已完成总包级同步审计；`T-023 / B1` 已完成并归档，`T-024 / B2`、`T-025 / B3`、`T-026 / B4`、`T-027 / B5`、`T-028 / B6`、`T-029 / B7` 均已完成，`T-030 / B8` 已完成并归档；`T-031 / B9` 已完成独立实现与本地验证，但 go/no-go 结论尚未收口，因此 `T-031` 与 `T-011` 仍保持 `in-progress`，且继续作为不阻塞主线的条件实验包。
- Next step: 基于 `T-031` 的实验与验证证据收口 go/no-go 结论，明确是否归档 `B9`，并继续推进真实厂商 bridge/connector 适配与实际数据库 baseline/apply。

## Goal
在保留当前 UniAssist `/v0` 统一入口兼容层的前提下，建立一个新的规划总包，用于分阶段升级为协作型 workflow 平台，并明确 sample validation workflow 只作为验证样例、探索型 agent 收敛边界、控制台形态和主数据面策略。

## Non-goals
- 直接在本任务中实施全部代码改造
- 将 `Convex` 作为首期主数据库或主后端运行时
- 在首期同时推动 connector/action layer 的真实接入
- 用画布式 builder UI 替代正式对象模型设计

## Context
- 当前仓库已经是 monorepo，但系统中心仍是 `session / timeline / provider / outbox`。
- 设计记录已经给出目标对象模型和分层方向，但需要一个 repo 内可持续维护的任务总包，承载升级节奏和边界冻结。
- 用户已确认三条关键方向：
  - `B3` 历史上以 `ua-teaching-validation-implementation` 命名交付首个样例验证包，但该样例不代表当前产品方向；
  - 首个样例验证包必须覆盖“探索型 agent 的收敛过程”；
  - `control-console` 应按独立 Web 应用方向讨论；
  - 逻辑上拆分控制面与 runtime，同时保留可部署性；
  - `Convex` 目前不作为主数据面的默认路线。

## Acceptance criteria (high level)
- [x] 建立独立的新任务总包，而不是混入现有 v0 hardening 主线
- [x] 输出一份可持续引用的 `roadmap.md`
- [x] 固化总包级别的 `00-05` 文档结构
- [x] 项目治理索引中能识别并注册该任务
- [x] Phase 1 的技术边界和首个 sample validation workflow 定义得到确认
- [x] implementation tranche 的顺序、依赖和 admission criteria 已固定，可直接指导后续 implementation task 开包
- [x] 当前已识别并任务化 v0.2 中尚未被显式承接的主体能力缺口
- [x] implementation bundle 的数量、职责与 repo 落位已固定，可作为后续开包模板
