# 01 Plan

## Phases
1. IaC 与目录基线初始化
2. 容器化与 k8s 清单落地
3. kind 一键脚本与本地验证
4. 文档与迁移建议

## Detailed steps
- 初始化 IaC SSOT（terraform）并写入 context overview。
- 新增四个服务镜像构建 Dockerfile。
- 新增 k8s base 资源：namespace、configmap、secret、deployments、services。
- 新增 kind overlay：NodePort 与 kind cluster 配置。
- 新增脚本：本地 kind 启动/销毁、rollout 验证。
- 运行一次 typecheck + k8s dry-run + 本地部署验证，记录证据。

## Risks & mitigations
- Risk: 集群内无法访问宿主机 Postgres/Redis。
- Mitigation: 默认使用 `host.docker.internal`，并在文档中提供替代方案。
- Risk: 镜像构建时间长。
- Mitigation: 保持 Dockerfile 简洁，先保证可运行再做多阶段优化。
