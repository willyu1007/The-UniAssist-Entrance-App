# CI Configuration (LLM-first)

Use `.ai/skills/features/ci/scripts/ctl-ci.mjs` as the canonical entrypoint for CI setup, delivery wiring, verification, and status.

## Rules

- Track CI metadata in `ci/config.json`.
- Provider workflow files remain source-controlled outputs; edit them directly only when provider-specific behavior is intentional.
- Do not turn this file into a command catalog; the executable entrypoint is the script above.
