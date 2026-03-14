# Legacy Backup Ledger

This directory is the T-037 evidence target for legacy-only data backup before destructive schema removal.

## Scope

The legacy-only tables are:

- `sessions`
- `timeline_events`
- `provider_runs`
- `task_threads`
- `user_context_cache`

`outbox_events` and pure-`v1` workflow/governance tables are not part of this backup set.

## Current status

- Repo-side removal ledger: present
- Export manifest: present
- Live export files: generated
- Row counts: recorded in `export/row-counts.tsv`
- Checksums: recorded in `export/checksums.sha256`
- Execution note: local legacy footprint was split across two databases, so source DB is recorded per table in `export-manifest.json`

## Required export commands

The original single-`DATABASE_URL` procedure remains the preferred path when the target legacy footprint lives in one database:

```bash
mkdir -p dev-docs/active/ua-pure-v1-legacy-removal-and-identity-cleanup/artifacts/legacy-backup/export

for table in sessions timeline_events provider_runs task_threads user_context_cache; do
  psql "$DATABASE_URL" -c "\\copy (select * from ${table}) to 'dev-docs/active/ua-pure-v1-legacy-removal-and-identity-cleanup/artifacts/legacy-backup/export/${table}.csv' csv header"
done

for table in sessions timeline_events provider_runs task_threads user_context_cache; do
  psql "$DATABASE_URL" -Atc "select '${table}' as table_name, count(*) as row_count from ${table}" \
    >> dev-docs/active/ua-pure-v1-legacy-removal-and-identity-cleanup/artifacts/legacy-backup/export/row-counts.tsv
done

cd dev-docs/active/ua-pure-v1-legacy-removal-and-identity-cleanup/artifacts/legacy-backup/export
shasum -a 256 *.csv > checksums.sha256
```

The local execution used direct `psql` connections instead because the available snapshot was split across `uniassist_gateway` and `postgres`.

## Restore notes

```bash
for table in sessions timeline_events provider_runs task_threads user_context_cache; do
  psql "$DATABASE_URL" -c "\\copy ${table} from 'dev-docs/active/ua-pure-v1-legacy-removal-and-identity-cleanup/artifacts/legacy-backup/export/${table}.csv' csv header"
done
```

Validate row counts after restore against `row-counts.tsv` before allowing any replay or forensic analysis.
