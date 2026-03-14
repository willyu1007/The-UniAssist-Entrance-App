# Roadmap

## Summary
先搭建一套可落地的 k8s 运行底座，打通容器化、编排、脚本化部署和验收入口。

## Milestones
1. IaC SSOT 初始化（terraform）。
2. k8s base + kind overlay 清单完成。
3. 一键 kind 启动脚本完成并可验证。
4. 文档与迁移说明完成。

## Deliverables
- `ops/iac/terraform` 初始结构
- `ops/deploy/k8s` 清单与脚本
- k8s 运行手册（本地 + staging 迁移）
