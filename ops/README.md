# Ops

This folder holds DevOps-oriented configuration and handbook docs.

High-level split (created only when enabled):
- ops/packaging/  Build artifacts (often container images for services)
- ops/deploy/     Run artifacts in environments (deploy/rollback/runbooks)
- ops/observability/ Metrics, alert rules, and incident runbooks

Current enabled modules:
- `ops/packaging/`
- `ops/deploy/`
- `ops/observability/`

Guidelines:
- Keep definitions small and structured.
- Prefer a small number of scripts as execution entry points.
- Record decisions and history under ops/*/handbook/.
