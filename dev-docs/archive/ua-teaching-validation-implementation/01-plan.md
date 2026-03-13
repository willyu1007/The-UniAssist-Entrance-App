# 01 Plan

## Phases
1. Governance bootstrap
2. Compat sample rename
3. Contracts + runtime input envelope
4. Runtime persistence + historical sample flow artifacts
5. Platform recipe capture + scenario docs
6. Verification and context sync

## Detailed steps
- 创建 `B3` task bundle，更新母任务状态，并同步 project governance。
- 将 `apps/provider-sample`、包名、service id、executor id、env、测试与部署引用统一切到 `sample/provider-sample/compat-sample`。
- 扩 `packages/workflow-contracts`，补 historical sample validation payload、run/artifact 查询 shape、`capturedRecipeDrafts` 响应字段，以及 compat executor 保留输入封套。
- 让 `workflow-runtime` 把 node context / node config / 上游 artifact refs 显式传给 compat executor，并按 executor metadata 生成 typed artifacts。
- 为 `workflow-runtime` 增加 Postgres 定向持久化与 DB fallback read，覆盖 `WorkflowRun`、`WorkflowNodeRun`、`Artifact`、`Approval*`、`Actor*`、`AudienceSelector`、`Delivery*`。
- 在 `workflow-platform-api` 的 run command / query 路径中增加 run-derived `RecipeDraft` capture 与幂等更新。
- 补 `docs/scenarios/sample-review` 的 canonical workflow 说明与 fixture。
- 完成 runtime / platform / gateway / conformance 回归，并记录 verification。

## Risks & mitigations
- Risk: rename 波及过大导致现有 `/v0` 和部署脚本回归
  - Mitigation: 先完成全局引用替换，再跑 conformance / workflow-entry / worker smoke 相关测试
- Risk: runtime persistence 变成全面 repository 重写
  - Mitigation: 本包只做定向持久化与 DB fallback，不重构整个状态机
- Risk: historical sample 反向定义平台基线
  - Mitigation: sample-specific 语义放在 payload / scenario docs，不新增业务专属表
