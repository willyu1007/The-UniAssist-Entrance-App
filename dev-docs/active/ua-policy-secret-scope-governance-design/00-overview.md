# 00 Overview

## Status
- State: in-progress
- Status note: `T-021` 已完成首轮高影响边界收敛；单一审批账本、统一 `PolicyBinding` 外壳和 `workspace + environment overlay` 的 `SecretRef` 模型已冻结。
- Next step: 继续细化 `ScopeGrant`、`PolicyBinding.config_json` 和 control-plane API DTO 的边界。

## Goal
建立一份 handoff-ready 的治理模型设计基线，明确高风险执行能力如何被审批、绑定、授权和撤销。

## Non-goals
- 不实现 vault/KMS
- 不实现权限后台
- 不设计具体第三方 connector 权限细节

## Context
- 设计记录把 `policy / approval / secret / scope` 视为团队版 OpenClaw 的核心控制面能力。
- 当前 `T-013` 只冻结了风险矩阵，`T-014` 只冻结了 connector binding owner。
- 如果没有单独子包，后续实现会把治理逻辑重新分散到各个 runtime/connector 中。

## Acceptance criteria (high level)
- [x] 文档明确给出治理对象清单和 owner
- [x] 文档明确给出哪些动作必须走 governance request
- [x] 文档明确给出 secret ref 与 scope grant 的生命周期
- [ ] 文档可以作为后续 policy/binding implementation 的统一前置
