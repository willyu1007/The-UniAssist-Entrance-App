# Codegen Outputs

This directory is generated output from the UI contract system.

## Rules

- Do not hand-edit files here.
- When `ui/contract/` or `ui/tokens/` changes, rerun the repository UI codegen workflow, typically via the `ui-system-bootstrap` skill and its generator. This directory is an output surface, not an authoring surface.
- The generated file set may change with contract shape; do not document it as a fixed inventory here.
- Verification is simple: regenerate and confirm the outputs match the current contract inputs.
