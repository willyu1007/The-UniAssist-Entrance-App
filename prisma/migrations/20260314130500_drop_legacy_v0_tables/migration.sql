-- T-037 pure-v1 irreversible cutover
-- Drop backed-up legacy /v0 compatibility tables after authoritative runtime cutover.

DROP TABLE IF EXISTS "task_threads";
DROP TABLE IF EXISTS "user_context_cache";
DROP TABLE IF EXISTS "provider_runs";
DROP TABLE IF EXISTS "timeline_events";
DROP TABLE IF EXISTS "sessions";
