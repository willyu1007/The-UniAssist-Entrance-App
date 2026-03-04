# 00 Overview

## Status
- State: done
- Next step: 基于当前清单扩展 staging 集群专用 overlay（镜像仓库、secret 管理、资源配额）。

## Goal
为 UniAssist 建立一套可复现的 Kubernetes 基线环境（先本地 kind，再可迁移到 staging 集群）。

## Non-goals
- 不在本任务完成生产级高可用与多区容灾。
- 不在本任务引入云厂商专属能力耦合（如专有 LB/存储 CSI）。

## Context
- 现有项目具备本地进程运行与 staging 脚本化验证能力。
- 缺少容器化部署与 k8s 编排资产，导致环境一致性与演练效率受限。

## Acceptance criteria (high level)
- [x] `ops/iac/terraform` 作为 IaC SSOT 初始化完成并通过 verify。
- [x] 提供 `ops/deploy/k8s` 基础清单（gateway/provider/adapter/worker + config/secret）。
- [x] 提供 kind overlay 与本地访问入口（gateway/adapter）。
- [x] 提供一键脚本完成：建镜像 -> kind load -> apply -> rollout 检查。
- [x] 输出运行手册与风险说明，可用于后续 staging 迁移。
