# 05 Pitfalls

## Do-Not-Repeat Summary
- 不要把 connector callback/session 直接复用成 B6 bridge session。
- 不要让 published template 直接绑定 workspace-specific connector/resource id。
- 不要让 browser fallback 成为 write capability 的默认执行路径。

## Historical log
### 2026-03-12 - Connector workspace packages failed type resolution
- Symptom: 新增 `connector-sdk / connector-runtime / sample connectors` 初次 typecheck 时出现 `Cannot find module`, `Cannot find type definition file for 'node'`, 以及 `fetch/AbortController` 全局缺失。
- Root cause: 新 package 的 `tsconfig` 没有补齐 `types/lib`，且 `workflow-runtime` 的 package-level `paths` 覆盖了 root alias，导致新增 workspace alias 不可见。
- Tried: 先直接跑 `pnpm install`，只能补齐 workspace link，但没有解决 package 级 TS 配置缺失。
- Fix/workaround:
  - 为 connector 相关 package 补 `types: ["node"]`
  - 为需要 `fetch/AbortController` 的 package 补 `lib: ["ES2022", "DOM"]`
  - 为 `apps/workflow-runtime/tsconfig.json` 显式补 `@baseinterface/connector-sdk` path
  - 重新执行 `pnpm install`
- Prevention note: monorepo 新增 package 时，不要只改 root `tsconfig.json`；要同时检查子 package 是否覆写了 `paths/types/lib`。

### 2026-03-12 - Connector callback rejection was hidden behind 500
- Symptom: out-of-order connector callback 在 `workflow-runtime` 已正确返回 409，但经过 `connector-runtime` webhook ingress 后变成统一 500 `CONNECTOR_CALLBACK_FAILED`。
- Root cause: `connector-runtime` 的 internal HTTP helper 在下游非 2xx 时只抛通用 `Error`，丢失原始 status/code。
- Tried: 先在 runtime test 里按 500 断言，但这会掩盖 B7 的顺序/幂等语义，不符合目标。
- Fix/workaround: 在 `connector-runtime` 增加 `InternalRequestError`，为 callback/event dispatch 透传下游 HTTP status 与 error code。
- Prevention note: webhook ingress 这类边界层如果承担治理/幂等语义，不能把 4xx 压成 500，否则上游无法区分“可重试”与“明确拒绝”。

### 2026-03-12 - Event subscription dedupe key was accidentally global
- Symptom: 两个 `event_subscription` 收到同一个外部 event id 时，第二个 subscription 会被误判成 duplicate，导致对应 agent run 不启动。
- Root cause: `dispatchTrigger` 的 `dispatchKey` 在持久层是全局唯一；初版 `dispatchEventSubscription` 直接透传上游 key，没有按 subscription 做命名空间隔离。
- Tried: 先考虑在 `connector-runtime` 侧改 key，但这样无法覆盖 direct internal dispatch 调用。
- Fix/workaround: 改为在 platform 的 `dispatchEventSubscription` 统一前缀 `eventSubscriptionId:`，从语义源头保证去重域正确。
- Prevention note: 任何接入通用 dedupe ledger 的新 source，都要先明确 dedupe 域是全局、按 agent、按 trigger 还是按 subscription，不能默认复用原始外部 id。

### 2026-03-12 - Connector secret governance was only modeled, not enforced
- Symptom: connector binding 绑定了 `secretRefId` 之后，即使没有 active scope grant，也能直接起 action run 或拿到 event runtime-config。
- Root cause: B7 扩展了 `connector_binding / action_binding / event_subscription` 目标类型，但执行路径没有像 webhook trigger 一样调用 `isSecretUsable`。
- Tried: 先只在创建 binding 时拦截，但这会阻断“先建对象再走审批”的治理流，不符合现有 B5 模式。
- Fix/workaround: 在 action run 启动和 event-subscription runtime-config 两条实际消费 secret 的路径上统一执行 usable 校验，并允许从 `agent_definition / connector_binding / action_binding / trigger_binding / event_subscription` 目标收集 grant。
- Prevention note: 只扩枚举或 schema 不算完成治理集成；凡是引入新 target type，必须同步检查 create / enable / execute / runtime-config 这几条实际生效路径是否都落了 enforcement。
