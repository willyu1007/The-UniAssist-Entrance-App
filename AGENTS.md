# AI Assistant Instructions

**baseinterface-appmain** - Cross-platform mobile app template homepage SOT for reusable UI components and multimodal editing entry.

## Project Type

baseinterface-appmain - Cross-platform mobile app template homepage SOT for reusable UI components and multimodal editing entry.

## Tech Stack

| Category | Value |
|----------|-------|
| Language | react-native |
| Package manager | pnpm |
| Repo layout | monorepo |
| Frontend | react-native-expo |
| Backend | none |
| Database | postgres |
| API style | none |

## Key Directories

| Directory | Purpose | Entry Point |
|-----------|---------|-------------|
| `apps/` | Applications | - |
| `packages/` | Shared packages | - |
| `init/` | Project initialization | `init/AGENTS.md` |
| `init/_tools/feature-docs/` | Optional feature documentation | `init/_tools/feature-docs/README.md` |
| `.ai/` | Skills, scripts, LLM governance | `.ai/AGENTS.md` |
| `dev-docs/` | Complex task documentation | `dev-docs/AGENTS.md` |
| `.codex/` | Codex skill stubs (generated) | - |
| `.claude/` | Claude skill stubs (generated) | - |

## Routing

| Task Type | Entry Point |
|-----------|-------------|
| **First time / Project setup** | `init/AGENTS.md` |
| **Skill authoring / maintenance** | `.ai/AGENTS.md` |
| **LLM engineering** | `.ai/llm-config/AGENTS.md` |
| **Project progress governance** | `.ai/project/AGENTS.md` |
| **Complex task documentation** | `dev-docs/AGENTS.md` |

## Global Rules

- Follow progressive disclosure: read only the file you are routed to
- On context reset for ongoing work, read `dev-docs/active/<task-name>/00-overview.md` first

## Coding Standards (RECOMMEND)

- **ESM (.mjs)**: All scripts in the repository use ES Modules with `.mjs` extension. Use `import`/`export` syntax, not `require()`.

## Coding Workflow (MUST)

- Before modifying code/config for a non-trivial task, apply the Decision Gate in `dev-docs/AGENTS.md` and create/update the dev-docs task bundle as required.
- If the user asks for planning artifacts (plan/roadmap/milestones/implementation plan) before coding:
  - If the task meets the Decision Gate, use `plan-maker` first, then ask for confirmation to proceed with implementation.
  - If the task is trivial (<30 min), provide an in-chat plan (do NOT write under `dev-docs/`).
  - If the task needs context preservation (multi-session, handoff) or qualifies as complex, follow `dev-docs/AGENTS.md` and use dev-docs workflows.

## Workspace Safety (MUST)

- NEVER create/copy/clone this repository into any subdirectory of itself (no nested repo copies).
- Create throwaway test repos **outside** the repo root (OS temp or a sibling directory) and delete them after verification.
- Keep temporary workspaces shallow: if a path is getting deeply nested or has exceeded **12 path segments** total;, stop and clean up instead of continuing.

<!-- DB-SSOT:START -->
## Database SSOT and schema synchronization

**Mode: repo-prisma** (SSOT = `prisma/schema.prisma`)

- SSOT selection file: `docs/project/db-ssot.json`
- DB context contract (LLM-first): `docs/context/db/schema.json`
- If you need to change persisted fields / tables: use skill `sync-db-schema-from-code`.
- If you need to mirror an external DB: do NOT; this mode assumes migrations originate in the repo.

Rules:
- Business layer MUST NOT import Prisma (repositories return domain entities).
- If `features.contextAwareness=true`: refresh context via `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`.
<!-- DB-SSOT:END -->
