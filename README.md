# The-UA-Entrance-APP (UniAssist Workflow Platform)

## Current Position

- The repository now operates as a workflow platform with a retained `/v0` compatibility ingress.
- `/v0` is still supported for chat/timeline intake and legacy contract compatibility, but it is no longer the product center.
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

- `DATABASE_URL` turns on gateway-backed persistence.
- `REDIS_URL` turns on outbox and worker dispatch paths.
- Internal service auth supports `off`, `audit`, and `enforce`; prefer `audit` before `enforce`.
- `apps/frontend` is the `/v0` runtime surface. `apps/control-console` is the `/v1` control surface.
- `packages/contracts` is the `/v0` compatibility contract package. `packages/workflow-contracts` holds workflow/governance/connector contracts for the platform mainline.

## Documentation Policy

- This README intentionally avoids mirroring directory trees, workspace inventories, and generated-file lists that can be recovered by scanning the repository.
- When you need current module details, prefer the tree, local `package.json`, and the nearest local `README.md` or `AGENTS.md`.
