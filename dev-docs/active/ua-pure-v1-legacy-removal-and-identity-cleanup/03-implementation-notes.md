# 03 Implementation Notes

## Initial note
- `T-037` is intentionally destructive and must run last.
- It turns the planning promise of “no semantic drift remains” into an enforceable repo state.

## Responsibility contract
- predecessor tasks must prove pure-`v1` replacement exists
- this task then removes old artifacts and cleans remaining identity drift

## Expected repo landing
- legacy service/module roots
- old contracts packages
- docs and scripts carrying compat semantics
- workspace metadata and package names

## Review closure
- This package now explicitly distinguishes:
  - what must be deleted or rewritten
  - what may remain only as historical residue
  - what must be proven before deletion starts
- The review confirmed the cleanup scope is not hypothetical. Active repo evidence already exists in:
  - repo-level docs
  - gateway and frontend legacy modules
  - contracts and executor SDK compat helpers
  - sample scenario helpers and tests
- The package also now carries a hard rule for final signoff:
  - if forbidden legacy terms still exist in active paths, the rewrite is not complete even if the code runs

## Implementation guardrails for later
- Do not leave repo-level docs for “later” after deleting code; documentation drift is part of the cleanup task.
- Do not keep compat package names because they are convenient for import stability.
- Do not allow active tests to preserve deleted semantics under the label of regression coverage.
