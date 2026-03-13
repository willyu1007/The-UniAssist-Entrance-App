# 02 Architecture

## Scope boundary
- This task owns:
  - `workflow-platform-api`
  - `workflow-runtime`
  - `worker`
  - `trigger-scheduler`
  - repository and persistence wiring needed for pure-`v1` run lifecycle
- This task does not own:
  - operator UI
  - connector runtime dynamic loading
  - bridge runtime vendor integration
  - legacy deletion

## Backend kernel definition
- The backend kernel is the minimum set of services that can create, execute, pause, resume, observe, and finish a pure-`v1` run.
- The kernel MUST support:
  - `AgentDefinition`-based run start
  - platform-owned trigger dispatch for production entry
  - run state progression
  - node state progression
  - artifact creation
  - approval request + approval decision
  - interaction request + interaction response
  - run completion, failure, and cancellation
- The kernel is considered complete only if those behaviors remain valid when:
  - gateway is absent from the execution path
  - connector runtime is absent
  - external runtime bridge is absent

## Minimal executable scope
- The first pure-`v1` cut MUST include at least one platform-native execution path that:
  - accepts structured run input
  - produces at least one artifact
  - can block on approval or interaction
  - can resume and complete without connector or bridge support
- The first cut MUST also include at least one platform-owned production trigger path:
  - schedule trigger
  - or webhook trigger

## Command, query, and event ownership
- `workflow-platform-api` owns:
  - control-plane mutations and queries
  - production `agent-first` run start
  - operator/studio query surfaces
  - request validation and policy enforcement at the API boundary
- `workflow-runtime` owns:
  - run and node lifecycle state
  - approval and interaction blocking state
  - artifact ledger writes
  - formal event creation
  - execution continuation decisions
- `worker` owns:
  - outbox dispatch
  - retry scheduling
  - asynchronous continuation triggers
  - downstream projection fan-out
- `worker` MUST NOT own business semantics that belong to the runtime state machine.
- `trigger-scheduler` owns:
  - polling due schedule triggers
  - verifying and normalizing webhook trigger input
  - dispatching canonical trigger-start requests into the platform API
  - replay protection and trigger-delivery mechanics that are not runtime business semantics

## Service boundaries
- `workflow-platform-api`
  - control-plane objects
  - operator/studio queries
  - agent-first run command entry
  - trigger runtime-config and trigger dispatch control-plane endpoints
- `workflow-runtime`
  - run/node state machine
  - approval/interaction blocking
  - formal event production
- `worker`
  - outbox
  - retries
  - continuation
  - projection fan-out
- `trigger-scheduler`
  - schedule poller
  - webhook ingress
  - trigger dispatch client

## Native execution capability set
- The first cut does not need a rich executor catalog.
- It does need a platform-native capability set sufficient to prove the kernel:
  - transform or assign run-local state
  - emit artifact metadata and payload references
  - create approval requests
  - create interaction requests
  - resume blocked nodes from pure-`v1` request identities
- This capability set is a kernel proof mechanism, not a long-term connector replacement.

## Boundary exclusions
- `apps/gateway` is not part of the pure-`v1` kernel.
- `apps/frontend` is not part of the pure-`v1` kernel.
- Connector dynamic loading belongs to `T-036`.
- External bridge adapter/vendor integration belongs to `T-036`.
- Legacy compatibility cleanup belongs to `T-037`.

## Current repo evidence to account for
- `apps/workflow-runtime/src/service.ts` still emits provider-shaped interaction payloads and writes compat-shaped fields.
- `apps/workflow-platform-api/src/platform-service.ts` and `platform-controller.ts` still accept compat-shaped patch and resume data.
- `apps/worker/src/worker.ts` still references gateway base URLs and gateway projection calls.
- `apps/workflow-platform-api/src/server.ts` already exposes internal trigger endpoints for due triggers, webhook runtime config, and trigger dispatch.
- `apps/trigger-scheduler/src/server.ts` and `platform-client.ts` already implement schedule polling and verified webhook dispatch paths that must be brought under the pure-`v1` kernel contract.
- `apps/gateway` still contains workflow projection and provider-routing semantics that must not remain part of the new kernel definition.

## Security and policy carry-over
- `T-006` remains applicable:
  - internal service authentication stays required across platform API, runtime, and worker calls
  - scope/policy enforcement cannot be deferred because the surface is being renamed
- webhook trigger secrets and replay windows remain part of the security boundary and cannot be treated as optional integration details
- `T-034` does not redesign security, but it must preserve and correctly route those controls through the new pure-`v1` command paths.

## Handoff contract to T-035 and T-036
- `T-035` may assume stable run/approval/artifact/draft/agent/trigger query semantics.
- `T-036` may assume stable run ledger and approval/artifact ownership, but may not reopen them.

## Verification target
- An implementer can prove the pure-`v1` backend works before any connector or bridge path is added.
