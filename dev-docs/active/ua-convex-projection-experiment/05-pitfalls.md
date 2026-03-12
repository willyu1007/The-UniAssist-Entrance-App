# 05 Pitfalls

- Do-not-repeat:
  - 不要为了实验方便让 `apps/control-console` 直接读取 Convex。
  - 不要让 Convex failure 影响 `/v1/runs` authoritative fallback。
  - 不要把 hidden CLI/bootstrap 约束扩散成 production runtime 依赖。

- 2026-03-13: bootstrap 只按 `existing.slice(limit)` 删除旧文档是不够的
  - Symptom: 复用本地 Convex deployment 时，`/v1/runs` 与 projection 对比会混入上一次实验残留的 summary。
  - Root cause: `bootstrap()` 只删除“超出 limit 的文档”，没有删除“已不在 authoritative recent window 里、但仍位于前 limit 的旧文档”。
  - What was tried: 先从测试侧清理 local backend；虽然能绕过问题，但不能保证 projection 语义正确。
  - Fix/workaround: 将 bootstrap 改成“按 authoritative current runId set 精确替换”，删除所有不在 bootstrap 输入集内的旧 summary。
  - Prevention note: 所有 projection bootstrap 都要明确是“append/merge”还是“authoritative replace”；recent-window 实验默认按 replace 设计。

- 2026-03-13: Convex 本地 deployment 测试不要默认假设 `3210` 端口空闲
  - Symptom: smoke test 或 B9 集成测试在已有 local backend 存活时会直接报端口占用，形成误导性失败噪音。
  - Root cause: `convex dev` 本地 backend 可能在测试结束后继续驻留，后续测试若再次强制启动会撞端口。
  - What was tried: 单纯在测试尾部 kill 启动命令；这对 wrapper 进程有效，但不总能回收已存在的 local backend。
  - Fix/workaround: smoke test 与 B9 集成测试先探测现有 local backend；若已可用则复用，否则再启动新的 deployment。
  - Prevention note: 涉及本地基础设施的测试优先采用“probe then bootstrap”模式，而不是无条件抢固定端口。

- 2026-03-13: Convex 配置错误必须视为实验降级，不是平台启动失败
  - Symptom: `UNIASSIST_ENABLE_CONVEX_RUNBOARD_EXPERIMENT=true` 且 `UNIASSIST_CONVEX_URL=not-a-url` 时，平台在 adapter 构造阶段直接抛错退出。
  - Root cause: `ConvexHttpClient` / `ConvexClient` 会同步校验 deployment 地址；如果 controller 还没接管 fallback，异常就会在启动阶段泄漏成 fatal error。
  - What was tried: 仅在 `runboardProjection.start()` 外层 catch；这对“坏 host”有效，但拦不住构造期语法错误。
  - Fix/workaround: `createRunboardProjectionAdapter()` 内部构造真实 adapter，并在构造期捕获异常后降级到 `NoopRunboardProjectionAdapter('invalid_url')`。
  - Prevention note: 所有可选外部集成的 client 初始化都要区分“构造期异常”和“运行期异常”；默认关闭/可降级实验必须同时兜住两类失败。

- 2026-03-13: projection shrink 恢复触发不能依赖瞬时连接健康态
  - Symptom: projection 被清空后，平台 `/v1/runs` 能 fallback，但 Convex read-model 本身不一定自动回填，导致恢复后续只靠增量 upsert 缓慢补洞。
  - Root cause: shrink 检测如果绑定 `subscriptionHealthy`，就会在 reset/重连边界上错过 recovery bootstrap 触发时机。
  - What was tried: 仅在 `isWebSocketConnected === true` 时触发 recovery；测试表明这会留下“authoritative 可读但 projection 永远空”的半恢复状态。
  - Fix/workaround: 只要已有 baseline 且 recent-window 观测到 shrink，就立即 invalidation + recovery bootstrap；连接态只决定何时重新把 projection 视作 ready，不决定是否触发重建。
  - Prevention note: 对 projection/read-model 来说，“数据形态异常”通常比“连接态标记”更可靠；恢复策略应以 authoritative 重建为核心，而不是等待底层连接状态完全稳定后才开始。
