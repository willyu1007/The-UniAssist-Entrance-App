# Packaging

This directory holds packaging definitions plus the minimal documentation needed to govern them.

## Non-obvious Rules

- Prefer executable entrypoints under `ops/packaging/scripts/` or `ctl-packaging.mjs` over prose-only instructions.
- Treat artifact naming, versioning, and provenance as first-class.
- Keep build rationale in `handbook/`; keep secrets out of the repository.
