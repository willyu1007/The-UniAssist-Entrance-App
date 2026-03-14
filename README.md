# The-UA-Entrance-APP (UniAssist Workflow Platform)

## Current Position

- The repository now operates as a pure `v1` workflow platform for agent-driven custom workflows.
- `apps/control-console` is the default operator surface and `workflow-platform-api` / `workflow-runtime` / `connector-runtime` / `trigger-scheduler` / `worker` form the default service topology.
- Scenario bundles under `docs/scenarios/` are validation fixtures, not product vertical definitions.
- Postgres/Prisma remains the authoritative data plane. Convex exists only as an optional, default-off projection experiment.

## Collaboration Entry Points

- Repo-level working rules: `AGENTS.md`
- Complex task and handoff governance: `dev-docs/AGENTS.md`
- Project registry and task sync: `.ai/project/AGENTS.md`
- LLM-readable contracts: `docs/context/INDEX.md`

## Local Setup

Prerequisites:
- Node.js >= 18
- Corepack
- pnpm 10.x

Install:

```bash
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install
```

Use root scripts or `pnpm --filter <workspace> <script>` as the canonical way to run workspaces. Do not use `npm`, `yarn`, or `bun`. The current workflow script inventory lives in the root `package.json`; this README intentionally does not mirror it.

## Non-obvious Runtime Notes

- `DATABASE_URL` enables Postgres-backed persistence for workflow platform services; without it, several local development paths fall back to in-memory state.
- `REDIS_URL` enables outbox delivery, worker consumption, and stream-backed dispatch paths.
- Internal service auth supports `off`, `audit`, and `enforce`; prefer `audit` before `enforce`.
- `packages/workflow-contracts` is the platform contract package; sibling SDK packages (`connector-sdk`, `executor-sdk`, `policy-sdk`) all hang off the same pure `v1` model.

## Documentation Policy

- This README intentionally avoids mirroring directory trees, workspace inventories, and generated-file lists that can be recovered by scanning the repository.
- When you need current module details, prefer the tree, local `package.json`, and the nearest local `README.md` or `AGENTS.md`.
