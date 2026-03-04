# 03 Implementation Notes

## Status
- Current status: `done`
- Last updated: 2026-03-04

## What changed
- 初始化 IaC SSOT（`ops/iac/terraform`）并通过 `ctl-iac verify`。
- 新增容器构建文件：
  - `ops/packaging/services/gateway.Dockerfile`
  - `ops/packaging/services/provider-plan.Dockerfile`
  - `ops/packaging/services/adapter-wechat.Dockerfile`
  - `ops/packaging/services/worker.Dockerfile`
  - 根目录 `.dockerignore`
- 新增 K8s base 清单（`ops/deploy/k8s/base`）：
  - namespace/configmap/secret
  - postgres + redis deployment/service
  - gateway/provider-plan/adapter-wechat/worker deployment
  - gateway/provider-plan/adapter-wechat service
- 新增 kind overlay（`ops/deploy/k8s/overlays/kind`）：
  - gateway/adapter NodePort patch
- 新增 kind 配置（`ops/deploy/k8s/kind/cluster.yaml`）：
  - NodePort 30087/30088 -> host 8787/8788 映射
- 新增一键脚本：
  - `ops/deploy/scripts/k8s-kind-up.mjs`
  - `ops/deploy/scripts/k8s-kind-down.mjs`
- 新增运行入口：
  - `pnpm k8s:kind:up`
  - `pnpm k8s:kind:down`
- 更新文档：
  - `README.md`
  - `ops/deploy/README.md`
  - `ops/deploy/k8s/README.md`
- 启用 deployment feature 配置并注册服务：
  - `ops/deploy/config.json`
  - `ops/deploy/environments/*.yaml`
  - `ops/deploy/http_services/*.yaml`
  - `ops/deploy/workloads/worker.yaml`

## Decisions & tradeoffs
- 本地基线选择 `postgres + redis` 一并部署在集群中，避免依赖宿主机服务，提升复现稳定性。
- 数据层使用 `emptyDir`，牺牲持久化换取简化；用于本地演练足够，staging 需改为托管或持久卷。
- internal auth 在本地默认 `audit` 模式，保证安全链路可观测同时减少本地联调阻塞。

## Known issues / follow-ups
- staging/prod 需要替换 `base/secret.yaml` 的开发默认值并接入外部 secret manager。
- staging overlay 仍待补：镜像仓库地址、资源 requests/limits、PDB/HPA、network policy。

## Pitfalls / dead ends (do not repeat)
- Keep the detailed log in `05-pitfalls.md` (append-only).
