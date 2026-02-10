# Feature: database

## Conclusions (read first)

- Enables DB schema SSOT workflows based on `db.ssot`
- Provides a human interface tool (query + change drafting): `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs`
- If `db.ssot=database`: materializes a repo-local DB mirror under `db/` and initializes DB tooling
- If `db.ssot=repo-prisma`: keeps `prisma/` as the schema SSOT convention anchor (no `db/` mirror)

## Requirements

- `db.ssot` must be `repo-prisma` or `database` (not `none`)
- `features.database` must be `true`

## How to enable

### Mode: repo-prisma (schema SSOT = `prisma/schema.prisma`)

In `init/_work/project-blueprint.json`:

```json
{
  "db": { "enabled": true, "ssot": "repo-prisma", "kind": "postgres", "environments": ["dev", "staging", "prod"] },
  "features": { "database": true }
}
```

### Mode: database (schema SSOT = running database)

In `init/_work/project-blueprint.json`:

```json
{
  "db": { "enabled": true, "ssot": "database", "kind": "postgres", "environments": ["dev", "staging", "prod"] },
  "features": { "database": true }
}
```

## What Stage C `apply` does

When enabled, Stage C:

1) If `db.ssot=database`:

- Copies templates from:
  - `.ai/skills/features/database/sync-code-schema-from-db/templates/`
- Runs:

```bash
node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs init --repo-root .
```

- Optional verification (when Stage C is run with `--verify-features`):

```bash
node .ai/skills/features/database/sync-code-schema-from-db/scripts/ctl-db.mjs verify --repo-root .
```

2) If `db.ssot=repo-prisma`:

- Ensures the `prisma/` directory exists (convention anchor; non-destructive)

## Key outputs

- `docs/project/db-ssot.json` (SSOT mode selection file)
- `node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs` (human interface)
- `db/**` (only when `db.ssot=database`)
- `prisma/**` (only when `db.ssot=repo-prisma`)

## Common commands

```bash
# Inspect SSOT mode + input sources
node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs status

# Query tables/columns/enums and write a human doc
node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs query users

# Draft a change request (writes a modify doc with a dbops block)
node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs modify users

# Generate a plan (+ runbook when db.ssot=database)
node .ai/skills/features/database/db-human-interface/scripts/ctl-db-doc.mjs plan users
```
