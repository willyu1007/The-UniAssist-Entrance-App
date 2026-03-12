# Convex Projection Experiment — Roadmap

## Goal
- 交付一个默认关闭、可移除的 `Runboard` 单切片实验，验证 Convex-backed `/v1/runs` recent-first 列表摘要与受控 subscription bridge 是否值得保留。

## Scope freeze
- In scope:
  - `packages/convex-projection-experiment`
  - `apps/workflow-platform-api`
  - env contract for dev/local experiment flags
  - automated local bootstrap and fallback verification
- Out of scope:
  - control-console direct Convex access
  - approval/draft/notification projections
  - staging/prod rollout

## Success criteria
- Projection path keeps `/v1/runs` response shape unchanged.
- `run.updated` can由 Convex subscription bridge 驱动，且 bridge 失效时自动回退。
- authoritative mutations never fail because Convex is unavailable.
- 实现复杂度仍限制在单列表摘要，而不是被迫扩展到 detail truth。
