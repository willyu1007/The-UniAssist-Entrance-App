# Convex Projection Experiment

This directory holds the Convex-side schema and functions for the optional runboard projection used by `@uniassist/convex-projection-experiment`.

## Rules

- Keep this projection-only. Do not move authoritative workflow state, approval state, or runtime decisions into Convex.
- Treat the experiment as removable. The primary data plane remains Postgres/Prisma through the workflow platform services.
- Convex-generated output stays tool-owned; do not replace this README with generic starter material or hand-maintain generated inventories here.
- Use the package-root scripts from `packages/convex-projection-experiment/package.json` for local development and tests instead of documenting ad-hoc CLI flows in this directory.
