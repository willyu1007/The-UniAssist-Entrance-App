# Shared Package

This package is for cross-service primitives that remain domain-neutral.

## Rules

- Keep helpers here generic; if code becomes workflow-specific, connector-specific, or UI-specific, move it to a narrower package.
- Do not mirror the export list in this README; `src/index.ts` is the authoritative inventory.
