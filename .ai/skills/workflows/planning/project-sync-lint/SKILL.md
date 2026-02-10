---
name: project-sync-lint
description: Project hub synchronizer and validator. Scans the repo (including multiple dev-docs roots), validates project/task metadata against the Project Contract, and can repair drift by generating missing task identity meta (.ai-task.yaml) and regenerating derived views under .ai/project/<project>/. Works in check-only mode for CI and apply mode for manual repair.
---

# Project Sync/Lint

## Purpose
Provide **centralized** synchronization and validation for the project governance system:
- Lint: enforce the Project Contract and detect drift
- Sync: generate missing `.ai-task.yaml` (IDs), upsert `registry.yaml`, and regenerate derived views
- CI: run in check-only mode to block inconsistent changes (errors only; warnings do not fail by default)

This skill is **repo governance oriented**. It should not implement product code changes.

## Commands
All commands are implemented by:
- `node .ai/scripts/ctl-project-governance.mjs`

### Init
Create `.ai/project/<project>/` files from templates (idempotent).

```bash
node .ai/scripts/ctl-project-governance.mjs init --project main
```

### Lint (check-only)
Scan all configured or discovered `dev-docs` roots and validate the repo against the contract.

```bash
node .ai/scripts/ctl-project-governance.mjs lint --check --project main
```

### Sync (dry-run or apply)
Generate missing task identity meta, upsert registry tasks, and regenerate derived views.

```bash
node .ai/scripts/ctl-project-governance.mjs sync --dry-run --project main
node .ai/scripts/ctl-project-governance.mjs sync --apply --project main
```

Optional: append sync-detected events to the hub changelog (append-only; apply-mode only):
```bash
node .ai/scripts/ctl-project-governance.mjs sync --apply --project main --changelog
```

## Contract highlights (read the full contract)
- Task progress SoT: task bundle `00-overview.md` `State:`
- Task identity SoT: `.ai-task.yaml` `task_id`
- Project semantic SoT: `.ai/project/<project>/registry.yaml`
- Migration: missing `.ai-task.yaml` is a warning, but invalid/duplicate IDs are errors

## Verification
- Lint (check-only):
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
- Sync preview (no writes):
  - `node .ai/scripts/ctl-project-governance.mjs sync --dry-run --project main --init-if-missing`
- If you changed SSOT skills:
  - `node .ai/scripts/lint-skills.mjs --strict`
  - `node .ai/scripts/sync-skills.mjs --scope current --providers both --mode reset --yes`

## Boundaries
- Do not edit `.codex/skills/` or `.claude/skills/` directly (generated).
- Do not require Python or third-party dependencies for governance scripts.
- Do not treat `.ai-task.yaml.status` as authoritative for task progress.
