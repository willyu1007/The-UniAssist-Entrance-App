# 02 Architecture

## Context & current state
- 教学场景已经证明了 actor/delivery/artifact/review/convergence 这组横向能力。
- 但设计记录要求第二验证场景继续压测：
  - connector/action
  - 双向事件桥
  - 环境与 scope 治理
  - runtime/preset 的上限

## Proposed design

### Scenario statement
- 采用一个 generic 的研发协作变更/发布流程作为第二验证样本：
  - `change intake -> plan synthesis -> risk review -> approved execution -> external actions -> callback/event aggregation -> delivery summary`

### Capability categories
- `issue_tracker`
- `source_control`
- `ci_pipeline`

### First-pass capability freeze
- 首版主链只强制包含：
  - `issue_tracker`
  - `source_control`
  - `ci_pipeline`
- `monitoring_or_quality_signal` 首版只作为可选输入或 callback source，不作为主链必选能力。

### Core artifacts
| Artifact | Role |
|---|---|
| `ChangeIntent` | 变更目标、范围、上下文 |
| `ExecutionPlan` | 分步执行计划与 action binding |
| `ActionReceipt` | 外部 action 的调用回执与结果 |
| `ValidationReport` | CI/quality/monitoring 回传结果 |
| `DeliverySummary` | 面向 requester/reviewer 的结构化结果 |

### Core flow
1. request intake
2. plan synthesis
3. human risk review
4. action fan-out to external systems
5. callback / event bridge aggregation
6. delivery summary and next-step decision

### Pressure minimum
- 该场景首版必须至少包含：
  - 1 个受治理的外部写操作
  - 1 个异步 callback 点
- 示例：
  - 受治理写操作：
    - 创建或更新 issue/task
    - 创建或更新 code review / branch status
    - 触发 CI pipeline
  - 异步 callback：
    - CI 结果回传
    - 外部状态回执
- 如果没有这两项，场景就无法真正压到 connector/action/event bridge/governance 的硬缺口。

### Pressure points this scenario must expose
- 哪些复杂度仍然可以由 runtime/preset 吸收
- 哪些 action/bridge/auth/scope 能力必须平台一级支持
- 在何处需要 browser fallback，但不能让它成为默认路径
- Work Graph 是否仍然只需 overlay 观察，而不用立即一级化

### Explicit exclusions
- 不写死 GitHub/Jira/CI/Monitoring 的具体品牌 API
- 不定义真实 connector DTO
- 不把 Work Graph 在本子包中升级为一级对象

## Risks and rollback strategy

### Primary risks
- 第二验证场景仍然只验证线性流程，没有压到 connector/event bridge
- 场景被具体工具品牌绑定
- 把所有研发复杂度都误判成平台硬缺口

### Rollback strategy
- 如果场景过宽，先收敛到“变更请求 -> review -> external actions -> callbacks -> summary”
- 如果 Work Graph 讨论过深，先保留 overlay 观察项，不升级对象层

## Open questions
- callback/event summary 的字段级 schema 与控制台映射，留待后续评审收敛
