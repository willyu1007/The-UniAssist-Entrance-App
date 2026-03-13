# 03 Implementation Notes

## Initial note
- `T-036` converges external capabilities onto a kernel that must already exist.
- It is not the place to finish unfinished core runtime work.

## Responsibility contract
- connector and bridge paths may extend the kernel
- connector and bridge paths may not redefine the kernel

## Expected repo landing
- `apps/connector-runtime`
- `apps/connectors/*`
- `apps/executor-bridge-*`
- `apps/workflow-runtime`
- `apps/workflow-platform-api`

## Review closure
- This package now treats external capability work as reconciliation work, not fresh platform design.
- The review confirmed there is already enough structure in the repo to justify convergence instead of reinvention:
  - platform APIs already exist for connector and bridge control-plane objects
  - runtime persistence already has bridge and connector extension records
  - connector runtime still hardcodes sample adapters and needs ownership correction
- The package also fixes one sequencing rule:
  - if an external path requires new run identities or private approval/artifact semantics, the design is wrong

## Implementation guardrails for later
- Do not introduce provider-style naming to describe connector or bridge sessions.
- Do not let bridge callbacks bypass the canonical run ledger and update queries directly.
- Do not keep dynamic loading as future work once this package claims completion.
