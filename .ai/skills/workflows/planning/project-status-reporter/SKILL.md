---
name: project-status-reporter
description: Read-only progress reporter. Produces a structured status snapshot from existing project/task artifacts (project hub + dev-docs) and includes an actionable next command; never modifies repo files.
---

# Project Status Reporter

## Purpose
Answer short user questions about current progress with an actionable, read-only report.

## Scope
Use this skill when the user wants a snapshot of project/task progress (overall or for a specific task) and the answer can be produced by reading existing tracking artifacts.
Do not use this skill for requests that ask to create/update tasks, change mappings, or repair metadata drift.

## Response templates

| Need | Reference |
|------|-----------|
| Task inventory | [reference/task-list.md](reference/task-list.md) |
| Overall progress | [reference/progress-summary.md](reference/progress-summary.md) |
| What to do next | [reference/next-action.md](reference/next-action.md) |
| Blockers | [reference/blocked-items.md](reference/blocked-items.md) |

## Process

1. Identify the query type from the user request.
2. Determine the project slug:
   - Use the user-provided project if present.
   - Otherwise default to `main`.
3. Read the corresponding reference document and use its **Data Source** command(s).
4. Optional (recommended for accuracy when hub exists): run
   - `node .ai/scripts/ctl-project-governance.mjs lint --check`
   - If lint reports errors, include a remediation command (`node .ai/scripts/ctl-project-governance.mjs sync --apply`) in the output but do not execute the write.
5. Generate output using the reference template.

## Verification
- Output includes at least one actionable command
- Status counts match query results
- Do not guess task details; read `00-overview.md` if needed

## Boundaries
- MUST NOT modify files (no `ctl-project-governance sync --apply`, no editing `dev-docs/**` / `.ai/project/**`)
- MUST NOT invent task details or blocker reasons
- MAY suggest repair commands when lint indicates drift

## Contract
Follow `.ai/project/CONTRACT.md` for sources of truth and status semantics.
