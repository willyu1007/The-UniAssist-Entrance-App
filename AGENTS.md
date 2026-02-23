# AI Assistant Instructions

**The-UA-Entrance-APP** - UniAssist unified entrance engine (v0).

## Project Type

Unified AI entrance/orchestration app (input ingress, routing, fallback, interaction aggregation, channel adapters).

## Tech Stack

| Category | Value |
|----------|-------|
| Language | typescript |
| Package manager | pnpm |
| Repo layout | monorepo |
| Frontend | react-native-expo |
| Backend | node-express (gateway + adapters) |
| Database | postgres |
| API style | restful + event timeline (sse/polling) |

## Repository Status

- Project initialization is complete.
- This repository does not use an `init/` directory anymore.
- v0 engine modules exist:
  - `packages/contracts`
  - `apps/gateway`
  - `apps/adapter-wechat`
  - `apps/provider-plan`
  - `apps/frontend` runtime integration

## Key Directories

| Directory | Purpose | Entry Point |
|-----------|---------|-------------|
| `apps/` | Applications | - |
| `packages/` | Shared packages | - |
| `.ai/` | Skills, scripts, LLM governance | `.ai/AGENTS.md` |
| `dev-docs/` | Complex task documentation | `dev-docs/AGENTS.md` |
| `docs/context/` | LLM-readable contracts (API/DB/process/UI) | `docs/context/INDEX.md` |
| `ui/` | UI contract/tokens/patterns | `ui/codegen/AGENTS.md` |
| `ops/` | Packaging/deployment conventions | `ops/packaging/AGENTS.md` |
| `.codex/` | Codex skill stubs (generated) | - |
| `.claude/` | Claude skill stubs (generated) | - |

## Routing

| Task Type | Entry Point |
|-----------|-------------|
| **Repo orientation / local setup** | `README.md` |
| **Contracts update** | `packages/contracts/` |
| **Gateway/API behavior** | `apps/gateway/src/server.ts` |
| **WeChat ingress adapter** | `apps/adapter-wechat/src/server.ts` |
| **Plan provider behavior** | `apps/provider-plan/src/server.ts` |
| **Frontend timeline/rendering** | `apps/frontend/app/index.tsx` |
| **Skill authoring / maintenance** | `.ai/AGENTS.md` |
| **LLM engineering** | `.ai/llm-config/AGENTS.md` |
| **Project progress governance** | `.ai/project/AGENTS.md` |
| **Complex task documentation** | `dev-docs/AGENTS.md` |
| **Context contract usage/update** | `docs/context/INDEX.md` |

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
