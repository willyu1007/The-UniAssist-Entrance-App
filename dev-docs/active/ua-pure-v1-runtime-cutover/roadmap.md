# Pure V1 Runtime Cutover — Roadmap

## Goal
- 交付最小可运行的 pure-`v1` backend kernel。

## Inputs
- `T-033 / ua-pure-v1-contract-reset`
- `T-019 / ua-agent-lifecycle-and-trigger-design`
- `T-021 / ua-policy-secret-scope-governance-design`

## Outputs
- agent-first run backend
- pure-`v1` approval/interaction resume path
- formal event and worker closure
- runnable kernel without connector/bridge dependence

## Exit criteria
- the platform can execute a minimal pure-`v1` workflow end-to-end without any `/v0` or compat dependency
