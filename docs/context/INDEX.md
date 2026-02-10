# Project Context Index (LLM-first)

## Conclusions (read first)

- `docs/context/` is the **stable, curated context layer** for this repository.
- The canonical index of all context artifacts is `docs/context/registry.json`.
- When `docs/context/` exists, AI/LLM SHOULD prefer these artifacts over ad-hoc repository scanning.
- Any change to context artifacts MUST be accompanied by an updated registry checksum:
  - Run `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch`
  - Verify with `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`

## What lives here

Typical artifacts (not exhaustive):

- API contract: `docs/context/api/openapi.yaml`
- Database schema contract: `docs/context/db/schema.json`
- Business processes: `docs/context/process/*.bpmn`

All artifacts MUST be registered in `docs/context/registry.json`.

## How to load context (for AI/LLM)

1. Open `docs/context/registry.json`.
2. Select only the artifacts needed for the current task.
3. Open those files by path (do not scan folders).

## Database schema contract

- The DB schema contract is: `docs/context/db/schema.json`.
- Format: `normalized-db-schema-v2` (LLM-optimized; tool-agnostic).
- Do NOT hand-edit the contract.

### How the contract is generated

The generator is SSOT-aware:

- Project DB SSOT configuration: `docs/project/db-ssot.json`
- Generator script: `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`

The generator chooses the source based on SSOT mode:

- `repo-prisma`: reads `prisma/schema.prisma` (SSOT) and emits the contract.
- `database`: reads `db/schema/tables.json` (mirror of real DB) and emits the contract.
- `none`: emits an empty contract.

After generation, `ctl-db-ssot` runs `ctl-context touch` (best effort) to keep checksums consistent.

## How to update context (script-only)

Use `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs`:

- Initialize (idempotent):
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs init`
- Register a new artifact:
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs add-artifact --id <id> --type <type> --path <repo-relative-path>`
- Update checksums after edits:
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch`
- Verify consistency (for CI):
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`

## Verification

- Registry and artifacts are consistent:
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`
