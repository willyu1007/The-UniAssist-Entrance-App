# 02 Architecture

## Context & current state
- `B7` 已有 connector registry、sample issue/CI connectors、same-run callback 和 `event_subscription` dispatch，但缺研发协作场景本身。
- `B3` teaching validation 已验证 compat executor artifact seeds + approval/delivery；`B8` 需要沿用同样模式，但切换到研发协作对象。
- `apps/control-console` 现有 approvals 页已能查看 evidence payload，runs 页只列 artifact type，尚不能直接 inspect typed payload。

## Implementation boundary
- `workflow-platform-api` 继续作为唯一 northbound command/query owner。
- `workflow-runtime` 继续拥有 run/node/artifact/approval 状态推进；`B8` 只补场景 helper 和测试，不重构 connector/runtime 边界。
- `provider-sample` 只承担 compat executor 场景节点逻辑，不承接 connector 写操作。
- `source_control-sample` 只实现 connector-backed write capability，不提供 event ingress。

## Canonical workflows
### Primary flow
1. `capture_change_intent`
   - compat executor 产出 `ChangeIntent`
2. `synthesize_execution_plan`
   - compat executor 产出 `ExecutionPlan`
3. `risk_review`
   - `approval_gate`，review `ChangeIntent + ExecutionPlan`
4. `issue_upsert`
   - connector action：`issue_tracker.issue.upsert`
5. `change_review_upsert`
   - connector action：`source_control.change_review.upsert`
6. `pipeline_start`
   - connector action：`ci_pipeline.pipeline.start`，等待 same-run callback
7. `summarize_delivery`
   - compat executor 汇总 `ActionReceipt + ValidationReport`，产出 `DeliverySummary`
8. `finish`

### Companion event flow
1. `capture_validation_signal`
   - workflow 由 `ci_pipeline.pipeline.finished` event subscription 触发
   - compat executor 产出 `ValidationReport`
2. `issue_upsert`
   - connector action：`issue_tracker.issue.upsert`
3. `finish`

## Typed artifacts
- `ChangeIntent`
  - 变更目标、范围、风险提示、requester context
- `ExecutionPlan`
  - step plan、target systems、action refs、rollback notes
- `ActionReceipt`
  - 继续复用 connector runtime 既有 payload
- `ValidationReport`
  - 继续复用 connector runtime 既有 payload
- `DeliverySummary`
  - requester-facing summary，聚合 issue/change review/pipeline outcome 与 next step

## Console mapping
- `/approvals`
  - 继续从 approval detail 的 artifact evidence preview 展示 `ChangeIntent` 与 `ExecutionPlan`
- `/runs`
  - 为 artifact 列表增加按需加载 detail 的入口，展示 typed payload / lineage
  - 目标 artifact：`ActionReceipt`、`ValidationReport`、`DeliverySummary`

## Rollback strategy
- 若 runs 详情增强引入过多前端复杂度，先保留 artifact detail drawer/button 的最小实现，不改 IA。
- 若 companion flow 与主流程 fixture 冲突，优先保证主流程稳定，再把 event subscription 断言收敛为独立测试 helper。
