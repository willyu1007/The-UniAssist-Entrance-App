# Dev Docs

Use `dev-docs/` only for complex tasks that need context preservation across sessions.

## Decision Gate

Create a task bundle under `dev-docs/active/<task-slug>/` only when any of these is true:
- The work is expected to take more than 2 hours.
- The work is likely to be paused, handed off, or resumed later.
- The change is high-risk or cross-cutting, such as DB/schema, auth/security, CI/CD/infra, or multi-service API boundary work.

Do not create dev-docs for:
- Single-file changes
- Trivial fixes
- Simple refactors with clear scope

If the user asks for a roadmap or plan before coding:
- For complex tasks, create `roadmap.md` first, then maintain the full task bundle.
- For trivial work, answer in chat and do not write under `dev-docs/`.

## Task Bundle Contract

Each complex task bundle uses the same fixed files:
- `roadmap.md`: macro plan, scope, risks, rollback
- `00-overview.md`: goal, non-goals, current status
- `01-plan.md`: phases, steps, acceptance criteria
- `02-architecture.md`: boundaries, interfaces, key risks
- `03-implementation-notes.md`: decisions, changes, rationale, follow-ups
- `04-verification.md`: every command and outcome
- `05-pitfalls.md`: resolved failures and do-not-repeat lessons

The filenames are part of the collaboration contract; keep their semantics stable even if the surrounding tree is easy to infer from the repo.

## Working Rules

- On context reset, read `00-overview.md`, then `01-plan.md`, then `05-pitfalls.md`.
- Update `00-overview.md` when status changes.
- Append to `03-implementation-notes.md` after each meaningful phase.
- Record every verification run in `04-verification.md`.
- Add a pitfall entry only after the issue is resolved and the prevention rule is clear.

## Governance Integration

When the repository project hub is in use:
- Run `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main` when a task is created, its status changes, or it is archived.
- Run `node .ai/scripts/ctl-project-governance.mjs lint --check --project main` after synchronization when validating drift.
- The task bundle is the status SoT; derived registry views must be regenerated instead of edited manually.

## Archive Rule

When a task is done and verification is green, move it from `dev-docs/active/` to `dev-docs/archive/` and then sync governance.
