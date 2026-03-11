# 02 Architecture

## Context & current state
- `workflow-runtime` 当前以内存 `RuntimeStore` 推进 run/node 状态，只把 formal events 发到 outbox。
- Prisma SSOT 已有 `WorkflowRun`、`WorkflowNodeRun`、`Artifact`、`Approval*`、`Actor*`、`Delivery*` 表，但没有被 runtime 全量写入。
- compat executor 目前只收到 `/v0` invoke/interact 的标准 payload，拿不到 node config / lineage context，无法可靠区分 parse / assessment / delivery 阶段。

## Implementation boundary
- `workflow-platform-api` 继续作为统一 command/query owner。
- `workflow-runtime` 继续拥有执行状态机、approval gate 和 artifact lifecycle 推进。
- `provider-sample` 只作为 compat executor 样例，不拥有平台正式对象或 recipe control-plane SoT。

## Canonical B3 flow
1. `parse_materials`
   - 输入：`subject`、`materials[]`
   - 输出：`ObservationArtifact`
2. `generate_assessment`
   - 输入：observation artifact refs + teacher / audience context
   - 输出：`AssessmentDraft`、`EvidencePack`、`AnalysisRecipeCandidate`
3. `teacher_review`
   - runtime `approval_gate`
   - 绑定 `AssessmentDraft` / `EvidencePack`
4. `fanout_delivery`
   - 输入：approved assessment + audience resolution
   - 输出：`ReviewableDelivery` + `DeliveryTarget[]`
5. `finish`

## Persistence strategy
- 运行中状态继续写内存 store 以保持现有推进逻辑。
- 每次 run/node/artifact/approval/delivery 变化后，追加同步到 Postgres。
- `getRun` / `getArtifact` / `resumeRun` 在内存缺失时允许从 Postgres 载入当前 snapshot。
- recipe draft 不由 runtime 直接创建；runtime 只暴露 sufficient facts，由 `workflow-platform-api` 捕获。

## Public shape changes
- `POST /v1/runs`、`POST /v1/runs/:runId/resume`
  - 增加 `capturedRecipeDrafts`
- `GET /v1/runs/:runId`
  - 增加 `approvalDecisions`、`deliveryTargets`、`actorProfiles`、`actorMemberships`、`capturedRecipeDrafts`
- `GET /v1/artifacts/:artifactId`
  - 返回 typed payload + lineage metadata，能区分 `AssessmentDraft`、`EvidencePack`、`ReviewableDelivery`、`AnalysisRecipeCandidate`

## Data rules
- `AssessmentDraft` 在审批通过前保持 `review_required`。
- `EvidencePack` 必须携带 source / observation refs。
- `ReviewableDelivery` 只在 approval 通过后生成。
- `RecipeDraft` 只从 approved `AnalysisRecipeCandidate + EvidencePack` capture，且 capture 必须幂等。

## Rollback strategy
- 若 DB fallback 不稳定，保留内存主链路并先关闭 restart 恢复测试，但不放弃 DB write。
- 若 sample workflow 过宽，优先保留四类对象和 approval/delivery gate，收缩 mock 内容细节。
