# 00 Overview

## Status
- State: in-progress
- Status note: `T-032` 已建立为 pure-`v1` rewrite 的唯一规划基线；本任务只承接治理和计划资产，不承接产品代码、schema 或 API 实现。
- Next step: 以 `T-032` 为唯一入口推进 `T-033` 到 `T-037`；五个 follow-on bundles 已完成逐包合同细化与收口 review，可按依赖顺序进入实施。

## Goal
建立 pure-`v1` 平台重写的 authoritative 规划总包，冻结架构边界、任务关系、实施 tranche 和 legacy 删除原则，并将其接入项目治理。

## Non-goals
- 不修改产品代码、数据库 schema、API 行为或运行时逻辑
- 不保留 `/v0` compatibility 作为本任务的约束前提
- 不在本任务中执行 legacy 模块删除、命名清扫或数据迁移
- 不在本任务中直接创建 `T-033` 到 `T-037` 的实施包

## Context
- 现有 `T-011` 及其派生设计任务均建立在“保留 `/v0` compatibility ingress”的前提上，和当前 pure-`v1` 方向冲突。
- 用户已明确两项新约束：
  - 重构完成后不保留任何存在语义漂移的定义或命名
  - 不再考虑兼容 `/v0`
- 因此需要一个新的 umbrella task 来接管规划基线，而不是继续在 `T-011` 上增量修补。

## Acceptance criteria (high level)
- [x] 新的 `T-032` 任务包已创建并完整落入 `dev-docs/active/ua-pure-v1-platform-rewrite/`
- [x] `T-032` 已注册到 `.ai/project/main/registry.yaml`，并归属新的 `M-001 / F-001`
- [x] 任务包明确声明本轮只做 planning 和 governance，不做代码实现
- [x] 任务包明确声明 pure-`v1` rewrite 是唯一 active planning baseline
- [x] 任务包明确分类 superseded、reused-as-input、historical-evidence-only 三类旧任务
- [x] governance `sync --apply` 与 `lint --check` 的结果已记录到 `04-verification.md`
- [x] `T-033` 到 `T-037` 的完整任务包已创建并注册到 project governance
- [x] `T-033` 到 `T-037` 已逐包补齐 admission criteria、职责边界、proof loop、handoff 和 package-closure review
