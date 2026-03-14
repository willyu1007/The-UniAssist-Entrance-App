# 02 Architecture

## Boundaries
- `workflow-runtime` 继续拥有 authoritative run / node / approval / artifact / delivery execution state。
- `workflow-platform-api` 是唯一 northbound query / mutation owner；control-console 不直连 runtime、DB、Redis、gateway timeline。
- `apps/control-console` 只消费 platform API DTO，并通过 SSE invalidation + query refetch 获得近实时感知。
- `ui/` token / contract 维持只读；控制台组件留在 app 内部，只有真实第二消费者出现时才考虑抽 `shared-ui`。

## Key decisions
- `GET /v1/runs` 返回 recent-first run summaries，不返回完整 snapshot 列表。
- approval queue/detail 与 decision 分离为显式 endpoint；前端只提交 `decision + comment?`，不拼 runtime `actionId`。
- `PATCH /v1/workflow-drafts/:draftId/spec` 采用 structured section patch：
  - request 必带 `baseRevisionId`
  - request 必带 `changeSummary`
  - patch target 限定在 draft spec section/field，不开放任意 JSON patch
- 每次成功的 console patch 都追加 `console_edit` revision，并更新 draft current spec / validation state。
- console stream 只发 invalidation event，不直接推完整实体快照；实体读取仍走 Query HTTP。

## Landing map
- Primary contract landing:
  - `packages/workflow-contracts`
- Primary execution / query landing:
  - `apps/workflow-runtime`
  - `apps/workflow-platform-api`
- Primary UI landing:
  - `apps/control-console`

## UI structure
- `/runs`
  - list: recent runs, status badge, blocker summary, delivery summary
  - detail: node timeline, approvals, delivery targets, captured recipe drafts
- `/approvals`
  - queue: pending-first list, requested actor, artifact summary
  - detail: evidence preview, approver context, approve/reject actions
- `/drafts`
  - list: draft lineage, active revision, validation/publishability
  - detail: revision compare summary, validation issues, publish actions
- `/studio`
  - draft spec form sections
  - conversational intake panel
  - validate/publish actions
  - read-only DAG preview generated from current draft spec

## Realtime strategy
- platform API maintains in-memory subscribers for control-console SSE clients.
- relevant northbound mutation success and runtime-backed state transitions publish invalidation events:
  - `run.updated`
  - `approval.updated`
  - `draft.updated`
  - `artifact.updated` when approval/detail evidence should refresh
- control-console transport uses SSE first; on error or stale timeout it falls back to interval refetch and retries SSE later.

## Verification targets
- API tests prove approval decision, run list, draft patch, revision conflict, and SSE invalidation emission.
- control-console tests prove route smoke, approval action flow, draft patch flow, DAG preview rendering, and polling fallback.
