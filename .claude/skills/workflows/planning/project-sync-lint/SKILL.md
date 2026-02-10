---
name: project-sync-lint
description: Project hub synchronizer and validator. Scans the repo (including multiple dev-docs roots), validates project/task metadata against the Project Contract, and can repair drift by generating missing task identity meta (.ai-task.yaml) and regenerating derived views under .ai/project/<project>/. Works in check-only mode for CI and apply mode for manual repair.
category: workflows/planning
ssot_path: .ai/skills/workflows/planning/project-sync-lint
---

# project-sync-lint (entry)

Canonical source: `.ai/skills/workflows/planning/project-sync-lint/`

Open `.ai/skills/workflows/planning/project-sync-lint/SKILL.md` and any supporting files referenced there (for example `reference.md`, `examples.md`, `scripts/`, `templates/`).

> **Note**: The frontmatter above is identical to the canonical source except for `ssot_path` and `category` which are added for navigation. After opening the source file, skip re-reading the description to avoid redundant token usage.
