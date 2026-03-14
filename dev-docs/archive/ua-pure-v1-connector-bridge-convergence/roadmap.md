# Pure V1 Connector Bridge Convergence — Roadmap

## Goal
- 把 connector runtime 和 external runtime bridge 对齐到同一套 pure-`v1` 主线 ledger。

## Inputs
- `T-033 / ua-pure-v1-contract-reset`
- `T-034 / ua-pure-v1-runtime-cutover`
- `T-014 / ua-connector-action-layer-design`
- `T-020 / ua-external-runtime-bridge-design`
- `T-021 / ua-policy-secret-scope-governance-design`

## Outputs
- dynamic connector loading
- bridge/connector ledger convergence
- external capability integration without compat drift

## Exit criteria
- external capabilities can be added without reopening the pure-`v1` core model
