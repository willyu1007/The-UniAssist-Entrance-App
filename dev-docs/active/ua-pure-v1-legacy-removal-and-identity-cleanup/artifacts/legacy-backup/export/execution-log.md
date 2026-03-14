# Legacy Backup Execution Log

- Executed at: `2026-03-14T13:38:03Z`
- Client tooling:
  - `psql` from `/opt/homebrew/bin/psql`
  - `shasum` from system PATH
- Host: `127.0.0.1:5432`

## Source mapping

- `uniassist_gateway`
  - `sessions`
  - `timeline_events`
  - `provider_runs`
  - `user_context_cache`
- `postgres`
  - `task_threads`

## Commands used

```bash
psql -h 127.0.0.1 -p 5432 -U yurui -d uniassist_gateway \
  -c "\\copy (select * from public.sessions order by session_id) to '.../export/sessions.csv' csv header"

psql -h 127.0.0.1 -p 5432 -U yurui -d uniassist_gateway \
  -c "\\copy (select * from public.timeline_events order by event_id) to '.../export/timeline_events.csv' csv header"

psql -h 127.0.0.1 -p 5432 -U yurui -d uniassist_gateway \
  -c "\\copy (select * from public.provider_runs order by run_id) to '.../export/provider_runs.csv' csv header"

psql -h 127.0.0.1 -p 5432 -U yurui -d uniassist_gateway \
  -c "\\copy (select * from public.user_context_cache order by profile_ref) to '.../export/user_context_cache.csv' csv header"

psql -h 127.0.0.1 -p 5432 -U yurui -d postgres \
  -c "\\copy (select * from public.task_threads order by session_id, task_id) to '.../export/task_threads.csv' csv header"

cd dev-docs/active/ua-pure-v1-legacy-removal-and-identity-cleanup/artifacts/legacy-backup/export
shasum -a 256 *.csv > checksums.sha256
```
