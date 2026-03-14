# External Runtime Bridge Implementation — Roadmap

## Goal
- 实现 `T-011 / B6` 的 external runtime bridge 首版闭环：agent 绑定 bridge、bridge 注册与治理、agent run 启动、完整异步 callback、run cancel。

## Planning-mode context and merge policy
- Runtime mode signal: execution
- User confirmation when signal is unknown: already-confirmed
- Host plan artifact path(s):
  - `dev-docs/active/ua-openclaw-collab-platform/01-plan.md`
  - `dev-docs/active/ua-external-runtime-bridge-design/02-architecture.md`
- Requirements baseline:
  - `dev-docs/active/ua-openclaw-collab-platform/roadmap.md`
  - `dev-docs/active/ua-external-runtime-bridge-design/roadmap.md`
  - `dev-docs/active/ua-agent-governance-implementation/02-architecture.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > parent task docs > design task docs > existing code reality > model inference
- Repository SSOT output: `dev-docs/active/ua-external-runtime-bridge-implementation/roadmap.md`

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| Parent bundle | `dev-docs/active/ua-openclaw-collab-platform/01-plan.md` | B6 tranche scope / repo landing | high | 母任务冻结 bundle 责任 |
| Design task | `dev-docs/active/ua-external-runtime-bridge-design/02-architecture.md` | bridge 定位、owner、callback set | high | `T-020` 是唯一设计基线 |
| Governance implementation | `dev-docs/active/ua-agent-governance-implementation/02-architecture.md` | agent lifecycle / trigger / scope 基线 | high | `B5` 已完成并作为上游 |
| Existing runtime code | `apps/workflow-runtime` | start/resume/outbox/event behavior | high | 必须兼容现有 compat path |

## Non-goals
- 不实现通用 executor registry
- 不实现 connector runtime / connector callback bridge
- 不实现 control-console 新页面
- 不绑定真实 LangGraph / OpenAI / 第三方 runtime SDK
- 不让 external runtime 直接拥有 workflow authoritative state

## Assumptions
- `B6` 首版只做 bridge-specific API，不把 northbound 面提前泛化成 `/v1/executors`
- agent 级桥接的含义是“agent 绑定 bridge”，不是把平台 runtime 主权让渡给 bridge
- callback ingress 固定由 `workflow-runtime` 直收，worker 继续只处理 formal-event fan-out
- 首个 bridge app 为 vendor-neutral sample bridge，用于协议验证与回归测试

## Phases
1. Governance bootstrap and task registration
2. Contracts and schema expansion
3. Platform API bridge lifecycle + agent run orchestration
4. Runtime bridge invoke/resume/cancel/callback path
5. Sample bridge and end-to-end verification

## Verification and acceptance criteria
- Automated checks:
  - `node .ai/scripts/ctl-project-governance.mjs sync --apply --project main`
  - `node .ai/scripts/ctl-project-governance.mjs lint --check --project main`
  - `pnpm --filter @uniassist/workflow-contracts typecheck`
  - `pnpm --filter @uniassist/executor-sdk typecheck`
  - `pnpm --filter @uniassist/workflow-runtime test`
  - `pnpm --filter @uniassist/workflow-platform-api test`
- Manual checks:
  - external-runtime agent 可以经 `POST /v1/agents/:agentId/runs` 启动
  - bridge callback 可以产出 checkpoint / approval_requested / result / error
  - run cancel 只对 external-runtime run 生效，并明确拒绝非 bridge run
- Acceptance criteria:
  - 实现者不再需要决定 bridge 绑定层级、northbound API 形态、callback owner 或 cancel 入口

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| external runtime 重新混入 compat executor registry | medium | high | 单独 `BridgeRegistration` 与 bridge client | `EXECUTOR_REGISTRY` 被拿来承载 bridge | 回退到 agent-bound bridge snapshot |
| callback 绕过 runtime 直接写 authoritative objects | low | high | callback 统一进入 runtime normalized ingress | bridge app 需要 DB write 权限 | 回退为 runtime-only apply path |
| agent 与 bridge workspace 交叉污染 | medium | medium | create/update 阶段强校验 workspace match | negative test 未覆盖 | 拒绝写入并保留 old record |
