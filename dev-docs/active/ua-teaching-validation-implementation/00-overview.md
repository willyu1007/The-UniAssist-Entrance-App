# 00 Overview

## Status
- State: ready-for-review
- Status note: `B3` implementation 与 review-driven hardening 已完成；sample workflow、runtime 定向持久化、run-derived recipe capture、provider sample 去语义漂移与回归测试已重新对齐。
- Next step: 如需落到真实环境 DB，按 `sync-db-schema-from-code` workflow 在获批后执行 schema apply；否则可在确认后归档本 task bundle。

## Goal
实现 `T-011 / B3` 的 teaching validation implementation：用首条受控示例 workflow 验证平台的 artifact / approval / delivery / recipe capture 主线能力，同时保持 `/v0` 兼容链路和现有 builder path 可用。

## Non-goals
- 不做真实文件上传、真实 parser、外部 LLM/connector 接入
- 不交付控制台页面或新增 northbound endpoint 集合
- 不把 teaching 场景产品化为独立业务应用
- 不恢复 `POST /v1/workflows` 直连创建模型

## Context
- `T-017` 已冻结 teaching validation 的流程与四类收敛对象。
- `T-013` / `T-024` 已落 `RecipeDraft` control-plane object，但 runtime capture / lineage 仍未实现。
- `T-018` 已在 Prisma SSOT 中补齐 run/artifact/approval/actor/delivery 模型；`workflow-runtime` 仍以内存执行态为主。
- 用户已要求在本包内完成 `provider-sample` 的全链路去语义漂移，并硬切换到中性的 sample compat executor。

## Acceptance criteria (high level)
- [x] 建立独立 `B3` task bundle 并同步 project governance
- [x] `provider-sample` 全链路硬切换为中性 sample compat executor
- [x] canonical validation workflow 跑通 `parse -> assessment -> teacher review -> fan-out delivery`
- [x] runtime 能把本场景 run/node/artifact/approval/delivery/actor 数据定向持久化到 Postgres
- [x] `workflow-platform-api` 能从 approved evidence + recipe candidate 幂等捕获 `RecipeDraft`
- [x] run/artifact 查询能返回 B3 所需 lineage / typed payload 信息
