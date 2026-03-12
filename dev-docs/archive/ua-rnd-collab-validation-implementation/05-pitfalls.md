# 05 Pitfalls

This file records resolved mistakes so the same failure mode is not repeated.

## Resolved pitfall: runtime test could not start B8 runs
- Symptom: `apps/workflow-runtime/tests/rnd-collab-validation.test.mjs` 初版通过 `/internal/runtime/start-run` 启动主流程时返回 `400`，报错指向 sample provider 地址缺失，导致 B8 e2e 无法进入 approval 之前的主流程阶段。
- Root cause: 该测试最初只拉起了 runtime / platform 侧依赖，没有同时拉起 `provider-sample`，也没有给 runtime 注入 `UNIASSIST_SAMPLE_PROVIDER_BASE_URL`，而 `compat-sample` 的节点都依赖 provider 回调。
- What was tried: 先检查 workflow template / artifact seed 是否拼写错误，随后把失败 run 的 runtime config 打印出来，确认问题不在 scenario helper，而在 provider base URL 未接线。
- Fix/workaround: 在测试 harness 中显式启动 `apps/provider-sample`，并把 provider base URL 注入 runtime 配置后再启动 run。
- Prevention note: 任何依赖 `compat-sample` executor 的 runtime e2e，都必须把 provider 进程和 `UNIASSIST_SAMPLE_PROVIDER_BASE_URL` 当成前置条件写进 test harness，而不是假定它会从默认环境继承。

## Resolved pitfall: full runtime test suite had port collisions
- Symptom: 单跑 B8 runtime test 能通过，但执行 `pnpm --filter @baseinterface/workflow-runtime test` 时出现 `EADDRINUSE`，导致整包验证不稳定。
- Root cause: 既有 B6/B7 相关 runtime tests 复用了相邻固定端口；新增 B8 测试后，测试文件并行执行时更容易撞到同一端口区间。
- What was tried: 先通过重跑确认不是 flake；之后对比各测试文件里的端口常量，定位到 `external-runtime-bridge` 相关 harness 与 B8 测试区间重叠。
- Fix/workaround: 将冲突测试迁移到独立端口区间，并保持 B8 所用端口与既有 suite 隔离。
- Prevention note: 新增 integration test 时，必须先检查同包内现有测试的端口占用；对固定端口测试要预留明显分段，而不是临时挑一个“看起来没被用”的值。

## Resolved pitfall: sample connector receipts lost canonical refs
- Symptom: `source_control.change_review.upsert` 的 `ActionReceipt.externalRef` 退回到了 `change-review:<runId>` fallback，而同一次 run 的 `DeliverySummary` 仍使用输入里的 `CR-101`，导致 artifact 之间引用不一致。
- Root cause: runtime 将原始 run input 放在 `__workflow.runInput`，但 sample connector 初版只读取顶层 `inputPayload.targets`，没有兼容 nested input / workflow metadata 入口。
- What was tried: 先核对 scenario fixture 与 provider artifact seed，确认 `CR-101` 已在 canonical input 中提供；再对比 runtime 给 connector 的 payload 结构，定位到 connector 读取路径过窄。
- Fix/workaround: 统一扩展 sample connector 的 ref 解析逻辑，同时兼容顶层 input、嵌套 `input`、以及 `__workflow.runInput`。
- Prevention note: 任何 sample connector 读取 canonical scenario refs 时，都不能假设运行时 payload 只有一种包装层级；新增 connector 前应先用真实 runtime payload 做一次结构核对。

## Do-not-repeat summary
- 不要把 `B8` 做成 `B7` 的基础设施返工。
- 不要为研发协作场景新增专用 northbound API。
- 不要把 `source_control` sample capability 扩成真实 repo 写入语义。
- 不要把 `event_subscription` 强耦合进主流程状态机。
