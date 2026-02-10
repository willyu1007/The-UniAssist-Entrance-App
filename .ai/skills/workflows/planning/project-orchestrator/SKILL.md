---
name: project-orchestrator
description: Project-level orchestrator for intake and continuity. Turns a new/ongoing request into a governance decision (reuse vs new task, mapping to Milestone/Feature/Requirement) and keeps the project hub consistent (registry/changelog/derived views). Focuses on planning and coordination, not product code changes.
---

# Project Orchestrator

## Purpose
Provide a **single front door** for project-level governance:
- Prevent duplicate work
- Keep semantic mapping clean (Feature/Requirement <-> Task)
- Advance the project mainline (milestones, priorities)
- Keep the project hub consistent with ongoing work

Project Orchestrator is **project-management oriented**. The workflow should not implement product code changes.

## When to use
Use Project Orchestrator when the request involves any of the following:
- Starting a new development request (feature, bug fix, refactor, integration)
- Continuing work but needing to locate the right task or decide whether to create a new task
- Mapping work to Milestones/Features/Requirements
- Updating project status, milestones, priorities, scope, or archival decisions
- Writing project-level updates (`registry.yaml`, `changelog.md`) to maintain long-term continuity

## When to avoid
Avoid using Project Orchestrator for purely local implementation within an already-scoped task when no scope/status/mapping changes are needed. In those cases, proceed with task-level execution workflows and run hub lint/sync later as needed.

## Inputs
- Natural-language request (new work or continuation)
- Optional: constraints (scope, deadlines, dependencies)
- Optional: pointers to existing task docs (`dev-docs/**/active/<task>/...`)

## Process (high-level)

> **Note**: `--project main` is the default and can be omitted. Replace `main` with the actual project slug for multi-project setups.

1. Ensure the project hub exists.
   - If missing, instruct to run:
     - `node .ai/scripts/ctl-project-governance.mjs init --project main`
2. Load the current project state:
   - Prefer reading `.ai/project/main/registry.yaml`
   - Run lint for sanity if needed:
     - `node .ai/scripts/ctl-project-governance.mjs lint --check`
3. Search for related work:
   - Prefer using `ctl-project-governance query` first (LLM-friendly output):
     - `node .ai/scripts/ctl-project-governance.mjs query --text "<keywords>"`
     - `node .ai/scripts/ctl-project-governance.mjs query --status in-progress`
   - If hub is missing, `query` falls back to scanning `dev-docs/**`
   - Cross-check existing task bundles under `dev-docs/**` when needed
4. Decide: reuse an existing Task vs propose a new Task.
5. If a new Task is needed:
   - Propose a stable task slug (kebab-case)
   - Do **not** create the task bundle in Project Orchestrator
   - Instruct to create a task bundle (via task-level workflow), then register it:
     - Create the task bundle at: `dev-docs/active/<slug>/`
     - Run: `node .ai/scripts/ctl-project-governance.mjs sync --apply`
6. Update project hub semantics (when needed):
   - Update `registry.yaml` to map Milestone/Feature/Requirement <-> Task
   - Changelog: prefer `node .ai/scripts/ctl-project-governance.mjs sync --apply --changelog` for registration/status events; add manual entries only for non-status events
7. Regenerate derived views (optional, but recommended after mapping changes):
   - `node .ai/scripts/ctl-project-governance.mjs sync --apply`

## Outputs

Output MUST include a triage decision and actionable command sequence.

### Output Fields

| Field | Description | Example |
|-------|-------------|---------|
| Decision | `REUSE_TASK` / `NEW_TASK` / `PROJECT_UPDATE` | `NEW_TASK` |
| Rationale | One sentence explanation | "No existing task covers OAuth2 integration" |
| Task ID | `T-xxx` or `pending assignment` | `T-005` |
| Slug | kebab-case task slug | `oauth2-provider-integration` |
| Mapping | `M-xxx > F-xxx > R-xxx > T-xxx` | `M-001 > F-002 > R-003 > T-005` |
| Next Actions | Numbered command/skill list | See below |

### Next Actions by Decision Type

| Decision | Next Actions |
|----------|--------------|
| NEW_TASK | 1. Create a dev-docs task bundle under `dev-docs/**/active/<slug>/` 2. `node .ai/scripts/ctl-project-governance.mjs sync --apply` 3. `node .ai/scripts/ctl-project-governance.mjs lint --check` |
| REUSE_TASK | 1. Read `dev-docs/**/active/<slug>/00-overview.md` 2. (if needed) Update `State:` + `node .ai/scripts/ctl-project-governance.mjs sync --apply` |
| PROJECT_UPDATE | 1. Edit `.ai/project/main/registry.yaml` 2. `node .ai/scripts/ctl-project-governance.mjs sync --apply` |

## Verification
- If you updated project hub files:
  - `node .ai/scripts/ctl-project-governance.mjs lint --check`
- If you changed SSOT skills:
  - `node .ai/scripts/lint-skills.mjs --strict`
  - `node .ai/scripts/sync-skills.mjs --scope current --providers both --mode reset --yes`

## Boundaries
- Do not implement product code changes in the workflow.
- Do not create task bundles under `dev-docs/**` (delegate to task-level workflows).
- Do not edit generated stubs under `.codex/` or `.claude/` directly.

## Contract
All behavior MUST follow `.ai/project/CONTRACT.md`.
- Do not introduce new files or rename contract files without explicit approval.
- Do not duplicate task execution details into the project hub; keep references and summaries only.
