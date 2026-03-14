# 02 Architecture

## Dependency map
- Gateway current monolith responsibilities:
  - HTTP routes + middleware
  - session/task/timeline in-memory state
  - provider registry + provider call + retry/circuit
  - auth guard + signature check
  - persistence/observability binding
- Frontend current monolith responsibilities:
  - HomeScreen state + side effects
  - Gateway ingest/interact calls + transport sync
  - interaction body renderer (card/provider_extension/...)
  - page layout and transient UI states

## Target boundaries
- Gateway:
  - routes modules: only parse/compose HTTP and call services
  - services modules: routing/provider/thread/timeline/auth
  - server.ts: dependency wiring + lifecycle only
- Frontend:
  - feature controller: state/effects/handlers
  - render module: interaction body branching
  - view module: JSX layout
  - index.tsx: composition entry

## Compatibility constraints
- Preserve existing route paths/status codes/JSON fields.
- Preserve task lifecycle behavior (`collecting/ready/executing/completed/failed`).
- Preserve client side flows: pending task selection, focus task, voice send/cancel, switch provider.
