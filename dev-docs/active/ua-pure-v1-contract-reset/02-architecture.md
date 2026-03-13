# 02 Architecture

## Scope boundary
- This task owns:
  - pure-`v1` object model
  - public DTOs and internal command DTOs
  - formal event model
  - OpenAPI contract scope
  - persistence planning boundary
- This task does not own:
  - handler/controller implementation
  - runtime state-machine implementation
  - UI routes or page design
  - connector runtime loading logic

## Authoritative contract domains
### 1. Authoring and publication domain
- `WorkflowTemplate`
- `WorkflowTemplateVersion`
- `WorkflowDraft`
- `DraftRevision`

### 2. Agent and trigger domain
- `AgentDefinition`
- `TriggerBinding`

### 3. Governance and execution policy domain
- `PolicyBinding`
- `ScopeGrant`
- `SecretRef`

### 4. Connector and external capability domain
- `ConnectorDefinition`
- `ConnectorBinding`
- `ActionBinding`
- `EventSubscription`
- `BridgeRegistration`

### 5. Runtime ledger domain
- `WorkflowRun`
- `WorkflowNodeRun`
- `Artifact`
- `ApprovalRequest`
- `ApprovalDecision`
- `InteractionRequest`

## Identity and ownership rules
- Control-plane identities are stable resource identities and are owned by the platform API layer.
- Runtime identities are generated at execution time and are owned by the runtime ledger.
- A production run MUST be created from `agentId`.
- A direct `workflowTemplateVersionId` start MAY exist only for studio/debug flows.
- `AgentDefinition` owns runtime strategy selection in first cut:
  - `platform_runtime`
  - `external_runtime`
- One agent uses one runtime strategy in first cut. Mixed strategy execution is out of scope.

## Minimum relationship matrix
- `WorkflowTemplate` owns long-lived business identity.
- `WorkflowTemplateVersion` owns executable published spec snapshots.
- `WorkflowDraft` and `DraftRevision` own mutable authoring state only.
- `AgentDefinition` references one published template/version baseline and one runtime strategy.
- `TriggerBinding` attaches production entry rules to one agent.
- `ActionBinding` connects workflow action refs to connector bindings.
- `BridgeRegistration` identifies an external runtime integration boundary and its callback contract.
- `WorkflowRun` references exactly one initiating agent or one studio/debug version start.
- `WorkflowNodeRun` belongs to one `WorkflowRun`.
- `ApprovalRequest`, `InteractionRequest`, and `Artifact` belong to one `WorkflowRun`, with optional `nodeRunId` association.

## Removed semantics
- The resulting baseline MUST NOT rely on:
  - `/v0`
  - `compatProviderId`
  - `providerId` as workflow identity
  - `WorkflowEntryRegistryEntry`
  - gateway ingress routing
  - builder chat intake
  - provider projections
  - workflow keyword entry
  - `replyToken`
  - `taskId` as compat projection

## Public API and DTO decisions
- Production start API is `agent-first` and uses `agentId` as the authoritative business entry.
- Resume is not a generic provider reply path. It is split into distinct contracts:
  - `approval decision` keyed by `approvalRequestId`
  - `interaction response` keyed by `interactionRequestId`
- Cancel, query, listing, and detail DTOs MUST refer to pure-`v1` identities only.
- Studio/debug DTOs MUST be explicitly labeled as non-production entry paths.
- DTOs in `packages/workflow-contracts` are the source for:
  - external API DTOs
  - internal runtime command DTOs
  - formal event payloads

## Public interface decisions
- Production run start is `agent-first`.
- direct workflow/version run is studio/debug-only.
- run resume is split into:
  - `resume approval` by `approvalRequestId`
  - `resume interaction` by `interactionRequestId`
- formal events are pure-`v1` events and are not shaped for timeline/provider projection.

## Formal event model decisions
- Formal events are append-only runtime facts, not transport-specific adapter messages.
- The event taxonomy MUST distinguish:
  - run lifecycle
  - node lifecycle
  - approval lifecycle
  - interaction lifecycle
  - artifact lifecycle
  - external callback receipt
- Event envelopes MUST carry platform-owned identities, not compat routing fields.
- If a downstream adapter needs projection, that projection is downstream work and must not shape the mainline contract.

## Persistence planning boundary
- This task defines what persistence needs to exist, not the migration implementation itself.
- Required handoff decisions include:
  - which compat columns are removed from mainline records
  - whether `InteractionRequest` needs a dedicated persisted record
  - whether runtime strategy is stored on `AgentDefinition` or an adjacent owned record
  - which tables remain authoritative for approvals, artifacts, and run events
- `T-034` may implement only after these ownership choices are frozen.

## Landing evidence
- `packages/workflow-contracts/src/types.ts` now exposes pure-`v1` DTOs, formal events, and interaction records without mainline compat exports.
- `apps/workflow-platform-api/src/platform-service.ts` now starts runs with `agent-first` / direct-version split semantics and no template-level `compatProviderId`.
- `apps/workflow-runtime/src/runtime-repository.ts` persists `agentId`, `startMode`, and `interaction_requests` instead of authoritative compat columns.
- `apps/workflow-runtime/src/service.ts` now emits pure-`v1` formal events at the contract boundary, while retaining limited local compat executor/bridge adapter logic for downstream cutover tasks.

## Handoff contract to T-034
- `T-034` may implement services only after:
  - DTO names and payload semantics are frozen
  - event ownership is frozen
  - persistence ownership and migration order are frozen

## Verification target
- An implementer can update contracts, OpenAPI and schema plans without making any remaining semantic decisions.
