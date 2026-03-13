# 02 Architecture

## Scope boundary
- This task owns:
  - legacy data backup
  - legacy table deletion
  - legacy module deletion
  - workspace/package/script/docs naming cleanup
  - final drift gate
- This task does not own:
  - new feature delivery
  - kernel redesign
  - console IA redesign
  - connector or bridge capability design

## Destructive-action rule
- This task runs only after pure-`v1` replacement is already proven by predecessor tasks.
- The burden of proof is on predecessors. `T-037` is not allowed to discover whether the replacement works by deleting the old path first.

## Removal targets
- old `/v0` APIs and contracts
- gateway/provider/chat-surface legacy mainline roles
- compat/provider-oriented names in active code and docs
- obsolete tests, scripts and docs that only exist to preserve compat paths

## Expected target classes
- Service/module roots likely subject to deletion or rewrite:
  - `apps/gateway`
  - `apps/frontend`
  - `packages/contracts`
  - compat-facing parts of `packages/executor-sdk`
- Code and metadata likely subject to cleanup:
  - repo-level `README.md`
  - repo-level `AGENTS.md`
  - workspace package metadata
  - sample scenarios and helpers that still encode compat/provider identities
- Persistence likely subject to cleanup:
  - compat columns on template/run/node records
  - legacy tables whose only purpose is `/v0` compatibility

## Cleanup rule
- no active alias survives final cutover
- if a name still carries old semantics, it must be renamed or removed
- historical references may remain only in archive bundles or backup evidence

## Allowed historical residue
- `dev-docs/archive/**`
- backup and export artifacts created by this task
- append-only historical notes where removing the term would destroy auditability
- Any other active path must be rewritten or deleted.

## Current repo evidence to account for
- `README.md` and `AGENTS.md` still describe `/v0` as a retained compatibility ingress.
- `apps/gateway` still exposes `/v0` ingress, provider routing, timeline projection, and provider event translation.
- `packages/contracts/README.md` still documents the `/v0` compatibility package.
- `packages/executor-sdk` still includes `compat-client.ts` and provider-centric types.
- `packages/workflow-contracts/src/types.ts` and sample scenario helpers still expose compat fields.

## Final gate model
- Deletion is not complete until all three pass:
  - structural deletion or rewrite of target modules
  - forbidden-term grep gate on active paths
  - post-cleanup governance/build/test validation

## Verification target
- A maintainer can scan the active repo and see only pure-`v1` mainline semantics.
