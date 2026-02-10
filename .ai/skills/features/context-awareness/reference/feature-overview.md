# Context Awareness Feature

## Purpose

This feature provides a **stable, verifiable context contract** so an LLM can work with reliable project knowledge:

- API surface (OpenAPI)
- Database schema contract (normalized JSON)
- Business processes (BPMN)
- Additional artifacts registered in a single registry

## Key invariants (MUST)

- `docs/context/` is the **only** supported entry point for "project context artifacts".
- `docs/context/registry.json` is the canonical index for all context artifacts.
- Any edits to registered artifacts MUST be followed by:
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs touch`
  - `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`

### Database schema contract (special rule)

- `docs/context/db/schema.json` is a generated contract.
- Do NOT hand-edit it.
- Update it via the SSOT-aware generator:
  - `node .ai/scripts/ctl-db-ssot.mjs sync-to-context`

(Then run `ctl-context touch` if your workflow does not already do so.)

## Recommended enforcement

- Add the policy snippet in `agents-snippet.md` to your repo-level `AGENTS.md`.
- Add the CI step in `ci-snippet.md` to enforce "script-only" changes.

## Verification

- `node .ai/skills/features/context-awareness/scripts/ctl-context.mjs verify --strict`
