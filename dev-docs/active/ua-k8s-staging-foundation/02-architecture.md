# 02 Architecture

## Scope boundaries
- In scope:
  - Kubernetes 编排基线（Deployment/Service/Config/Secret）
  - kind 本地环境 bootstrap
  - 与现有 staging 验证脚本对接
- Out of scope:
  - 云厂商专属 IaC 资源细节（VPC/LB/RDS）
  - 生产级弹性与容量规划

## Runtime topology
- Namespace: `uniassist-staging`
- Services:
  - `gateway` (`:8787`)
  - `provider-sample` (`:8890`)
  - `adapter-wechat` (`:8788`)
  - `worker` (no service)
- In-cluster dependencies (local baseline):
  - `postgres` (`postgres:5432`)
  - `redis` (`redis:6379`)

## Config strategy
- 公共非敏感配置走 `ConfigMap`。
- 密钥与连接串走 `Secret`（stringData）。
- internal auth 使用统一 keyset，按服务设置 `UNIASSIST_SERVICE_ID`。
- kind 本地 overlay 将 gateway/adapter 改为 NodePort，并通过 kind 端口映射暴露到宿主机 `8787/8788`。

## Key risks
- kind 网络与宿主机依赖联通性。
- 资源探针阈值设置不当导致 rollout 抖动。
