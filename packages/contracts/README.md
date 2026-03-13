# Contracts Package

`@baseinterface/contracts` is the `/v0` compatibility contract package.

## Rules

- Keep TypeScript types and JSON schemas aligned.
- Treat changes as compatibility-sensitive because gateway, frontend, and sample provider flows still consume this surface.
- Do not use this package as the home for `/v1` workflow-platform contracts; those belong in `packages/workflow-contracts`.
