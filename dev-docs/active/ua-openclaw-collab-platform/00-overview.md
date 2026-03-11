# 00 Overview

## Status
- State: in-progress
- Status note: `T-011` 已完成总包级同步审计，并已启动 `T-025 / ua-teaching-validation-implementation`；当前 implementation 主线进入 `B3`，重点验证 teaching sample workflow、runtime 定向持久化与 run-derived recipe capture。
- Next step: 推进 `T-025 / B3` 实施并验证；在 `B3` 稳定后再继续 `B4` / `B5` 后续主线。

## Goal
在保留当前 UniAssist `/v0` 统一入口兼容层的前提下，建立一个新的规划总包，用于分阶段升级为协作型 workflow 平台，并明确教学场景、探索型评估 agent 收敛、控制台形态和主数据面策略。

## Non-goals
- 直接在本任务中实施全部代码改造
- 将 `Convex` 作为首期主数据库或主后端运行时
- 在首期同时推动 connector/action layer 的真实接入
- 用画布式 builder UI 替代正式对象模型设计

## Context
- 当前仓库已经是 monorepo，但系统中心仍是 `session / timeline / provider / outbox`。
- 设计记录已经给出目标对象模型和分层方向，但需要一个 repo 内可持续维护的任务总包，承载升级节奏和边界冻结。
- 用户已确认三条关键方向：
  - 教学场景优先于研发场景；
  - 教学场景必须覆盖“探索型个性化评估 agent 的收敛过程”；
  - `control-console` 应按独立 Web 应用方向讨论；
  - 逻辑上拆分控制面与 runtime，同时保留可部署性；
  - `Convex` 目前不作为主数据面的默认路线。

## Acceptance criteria (high level)
- [x] 建立独立的新任务总包，而不是混入现有 v0 hardening 主线
- [x] 输出一份可持续引用的 `roadmap.md`
- [x] 固化总包级别的 `00-05` 文档结构
- [x] 项目治理索引中能识别并注册该任务
- [x] Phase 1 的技术边界和首个教学 workflow 定义得到确认
- [x] implementation tranche 的顺序、依赖和 admission criteria 已固定，可直接指导后续 implementation task 开包
- [x] 当前已识别并任务化 v0.2 中尚未被显式承接的主体能力缺口
- [x] implementation bundle 的数量、职责与 repo 落位已固定，可作为后续开包模板
