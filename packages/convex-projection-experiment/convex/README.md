# Convex Projection Experiment

This directory contains the Convex-side schema and functions for the optional runboard/read-model experiment used by `@baseinterface/convex-projection-experiment`.

## Rules

- Keep this experiment projection-only; do not add authoritative writes or bypass `workflow-platform-api`.
- `_generated/` is managed by the Convex CLI and must not be hand-edited.
- Use the package-level scripts (`dev:local`, `dev:local:watch`, `typecheck`, `test`) from the package root instead of documenting ad-hoc local commands here.
- Treat this directory as experimental infrastructure tied to `T-031`; it must remain safe to disable or remove without changing the primary data plane.
