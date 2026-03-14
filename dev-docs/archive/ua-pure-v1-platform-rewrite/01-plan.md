# 01 Plan

## Phase 1
- Objective: 建立治理锚点并发布 `T-032` 总包。
- Deliverables:
  - `M-001 / F-001 / T-032` registry 映射
  - `T-032` 标准任务包文件
- Exit criteria:
  - governance sync 成功
  - governance lint 成功

## Phase 2
- Objective: 冻结 pure-`v1` 的架构和任务关系，不进入实现。
- Deliverables:
  - pure-`v1` domain model 和边界说明
  - 旧任务关系矩阵
  - 后续 tranche 和 follow-on tasks 清单
- Exit criteria:
  - 实施者不需要再决定“是否保留 `/v0`”或“是否继续沿用 compat 命名”

## Phase 3
- Objective: 结束本轮 planning/governance 工作并为后续实施开包。
- Deliverables:
  - `T-033` 到 `T-037` 的任务拆分定义
  - 下一轮开包顺序和 admission criteria
- Exit criteria:
  - 本轮停止于 bundle 发布和治理同步，不进入代码改造

## Phase 4
- Objective: 逐包细化 `T-033` 到 `T-037` 的合同，并确认整体实施链可执行。
- Deliverables:
  - 每个子包的 admission criteria、scope boundary、required proof、downstream handoff
  - 整体实施顺序和 gate 说明
- Exit criteria:
  - 后续实施者不需要再判断“先做哪一个”“什么算完成”“何时允许进入 destructive cleanup”

## Follow-on execution tasks
- `T-033 / ua-pure-v1-contract-reset`
  - pure-`v1` contracts、DTOs、event model、OpenAPI、schema planning
- `T-034 / ua-pure-v1-runtime-cutover`
  - platform API、runtime、worker、agent-first execution path
- `T-035 / ua-pure-v1-studio-and-agent-ops`
  - control console、draft/studio/debug/operator surface
- `T-036 / ua-pure-v1-connector-bridge-convergence`
  - connector runtime、dynamic connector loading、bridge alignment
- `T-037 / ua-pure-v1-legacy-removal-and-identity-cleanup`
  - backup 旧数据、删除 legacy 模块、完成最终命名清扫

## Recommended execution order
1. `T-033`
2. `T-034`
3. `T-035` and `T-036` in parallel after `T-034`
4. `T-037`

## End condition for this round
- `T-032` 发布完成、子包合同细化完成且 governance 验证通过后，本轮任务结束。
- 任何代码、schema、API、runtime 层面的修改都必须在后续实施任务中进行。
