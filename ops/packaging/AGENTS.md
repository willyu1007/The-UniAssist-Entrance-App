# Packaging - AI Guidance

Use `node .ai/skills/features/packaging/scripts/ctl-packaging.mjs` as the canonical entrypoint for packaging metadata changes.

## Rules

- AI may update packaging definitions and docs, but humans own actual build and push execution.
- Keep packaging docs focused on decisions, constraints, naming, and provenance, not directory inventories.
- Record non-obvious rationale in `ops/packaging/handbook/`.
- Do not store credentials, tokens, or secret registry material here.
- Packaging target metadata is tracked in `docs/packaging/registry.json`.
