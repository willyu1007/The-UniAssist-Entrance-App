# 01 Plan

## Phases
1. 资产盘点（服务、依赖、配置、启动顺序）
2. 发布流程固化（部署/迁移/健康检查/回滚）
3. 门禁接入（测试命令与阻断条件）
4. 演练与修正（故障注入与回滚验证）

## Detailed steps
- 明确服务启动依赖图（gateway/worker/provider/adapter + Postgres/Redis）。
- 形成 staging 环境变量基线（含必须项与可选项）。
- 输出发布流程脚本化方案（可手工执行也可 CI 执行）。
- 接入 `pnpm test:conformance`、`pnpm smoke:redis:e2e` 作为门禁。
- 增加发布后探活与关键接口检查。
- 演练一次正常发布和一次回滚。

## Risks & mitigations
- Risk: 环境差异导致脚本在 staging 不稳定。
- Mitigation: 统一 env 模板并校验必填项。
- Risk: 回滚只在文档里可行，实操不可行。
- Mitigation: 强制执行回滚演练并记录证据。
