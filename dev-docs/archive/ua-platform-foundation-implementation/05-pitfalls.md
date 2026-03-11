# 05 Pitfalls

## Do-not-repeat summary
- 不要把 `B1` 直接做成完整 workflow platform；只交付有限图执行骨架。
- 不要让 gateway 直接拥有 workflow 状态机；它只负责入口命中和 `/v0` projection。
- 不要让 worker 重新变成第二个 runtime；它只执行 protocol/outbox/fan-out。

## Resolved issues log
### 2026-03-11 - B1 tests falsely failed due to shared fixed ports
- Symptom:
  - `workflow-runtime test`、`workflow-entry`、`test:conformance` 并行执行时出现 `EADDRINUSE`
  - 后续 poll 超时，表现像业务逻辑失败，但根因不是 runtime/gateway 语义错误
- Root cause:
  - 新增 B1 测试和既有 conformance 都复用了 `9877/9890/9892` 这组固定端口
- What was tried:
  - 先看 gateway/runtime/provider 的日志，确认失败发生在服务 listen 阶段，而不是请求处理阶段
  - 再串行重跑，验证业务链路本身是通的
- Fix/workaround:
  - 将 `apps/workflow-runtime/tests/workflow-runtime.test.mjs` 改到独立端口区间 `19990/19992`
  - 将 `apps/gateway/tests/workflow-entry.mjs` 改到独立端口区间 `19777/19790/19791/19792`
  - 最终按串行顺序重跑验证
- Prevention note:
  - 后续新增集成测试不要复用 conformance 的固定端口；默认使用独立测试端口区间，避免并行执行时互相污染。
