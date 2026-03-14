# Roadmap

## Summary
建立可复现的 Staging 发布基线，并把 Redis 端到端冒烟接入发布门禁，确保每次发布都可验证、可回滚。

## Milestones
1. 基线梳理：确认服务拓扑、环境变量、依赖顺序。
2. 发布流程：固化启动、迁移、健康检查、回滚步骤。
3. 门禁接入：在发布前强制执行 `pnpm test:conformance` 与 `pnpm smoke:redis:e2e`。
4. 文档与演练：输出 runbook，并至少完成一次演练记录。

## Deliverables
- Staging 部署与回滚 runbook
- 发布门禁命令与判定标准
- 环境变量清单与样例
- 演练记录（成功 + 失败回滚）
