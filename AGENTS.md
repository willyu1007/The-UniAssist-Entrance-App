# AI Assistant Instructions

Use this file for repository-level collaboration rules only. Do not treat it as a directory inventory; scan the repository for current module lists and generated outputs.

## Repository Semantics

- The repository's current center is the workflow platform, with `/v0` retained as a compatibility ingress.
- Historical sample scenarios and `/v0` surfaces must not be described as the current product direction.
- `apps/frontend` is the `/v0` runtime UI; `apps/control-console` is the `/v1` control UI.
- Postgres/Prisma is the database SSOT. Convex remains a projection experiment and must not become an authoritative store by documentation drift.

## Navigation Order

- Start with `README.md` for human-facing orientation.
- Use `dev-docs/AGENTS.md` for the complex-task decision gate and task-bundle lifecycle.
- Use `.ai/project/AGENTS.md` when task creation, status changes, or archive actions affect governance state.
- Use `docs/context/INDEX.md` when an LLM-readable contract already exists.
- Prefer the nearest local `AGENTS.md` or `README.md` before reading broad repo docs.

## Working Rules

- Follow progressive disclosure: read only the files you need.
- On context reset for ongoing work, read `dev-docs/active/<task-name>/00-overview.md` first.
- Use `pnpm` only for dependency install and workspace script execution.
- Before modifying code or config for a non-trivial task, apply the Decision Gate in `dev-docs/AGENTS.md`.
- Use repo scanning for inferable facts such as directory structure, workspace inventories, and generated outputs instead of copying them into docs.

## Workspace Safety

- NEVER create, copy, or clone this repository into a subdirectory of itself.
- Create throwaway test repos outside the repo root and delete them after verification.
- Keep temporary workspaces shallow; if a path grows deeply nested, stop and clean it up.

<!-- DB-SSOT:START -->
## Database SSOT and Schema Synchronization

**Mode: repo-prisma** (`prisma/schema.prisma`)

- SSOT selection file: `docs/project/db-ssot.json`
- DB context contract: `docs/context/db/schema.json`
- If persisted fields or tables change, use skill `sync-db-schema-from-code`.
- Do not mirror an external DB into the repo; migrations originate here.

Rules:
- Business-layer code MUST NOT import Prisma directly.
- If `features.contextAwareness=true`, refresh context with `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`.
<!-- DB-SSOT:END -->
