# 02 Architecture

## Context & current state
- 当前规划已经冻结了 workflow template/run/artifact/approval 主线，但还没有单独冻结 `AgentDefinition`。
- `T-013` 已明确 `publish` 只是模板发布，不等于激活长期能力。
- 设计记录要求平台支持长期触发、独立调用和自治执行体，但不允许每个 workflow 默认常驻化。

## Proposed design

### Core definitions
| Concept | Responsibility | Explicitly not responsible for |
|---|---|---|
| `AgentDefinition` | 将某个已发布 workflow version 封装为可独立触发的长期执行对象 | 重新定义 workflow template |
| `TriggerSpec` | 描述触发类型、条件和回调入口 | 持有 workflow state machine |
| `TriggerBinding` | 将 agent 与实际 trigger source / schedule / event source 绑定 | 决定 runtime 状态推进 |
| `AgentActivation` | 记录 activate/suspend/retire 生命周期与治理结果 | 代替 publish/version |

### Promotion rule
- workflow 默认只是 template/version。
- 只有满足下列至少一项时，才应升格为 agent：
  - 需要被其他 workflow 当作独立调用对象
  - 需要长期触发或后台自治运行
  - 需要绑定独立身份、scope、secret 或 trigger config

### Relationship to `WorkflowTemplateVersion`
- `WorkflowTemplateVersion` 与 `AgentDefinition` 首版固定为 `1:N`。
- 同一个已发布 workflow version 可以派生多个 `AgentDefinition`，因为它们可能在以下维度不同：
  - `identityRef`
  - `triggerConfig`
  - `ownerActorRef`
  - scope / secret / policy binding
- 因此不能把“运行身份”和“长期触发配置”回写到 template version 本体里。

### Lifecycle boundary
```ts
type AgentDefinitionStatus =
  | "draft"
  | "validated"
  | "approved"
  | "active"
  | "suspended"
  | "retired"
  | "archived";
```

### Trigger classes
- `manual`
- `message`
- `schedule`
- `webhook`
- `event_subscription`

### Trigger split rule
- `manual`
- `message`
  - 这两类触发首版不强制要求 `AgentDefinition`
  - 可以直接基于 `WorkflowTemplateVersion` 创建 run
- `schedule`
- `webhook`
- `event_subscription`
  - 这三类触发首版必须依赖 `active AgentDefinition`
  - 原因是它们天然需要长期触发、身份、治理和可撤销性

### Ownership rules
- `workflow-platform-api`:
  - 创建、更新、激活、挂起、下线 agent
  - 验证 trigger config 和治理规则
- `workflow-runtime`:
  - 只消费已经归一化的 start-run / resume-run 命令
  - 不拥有 trigger 配置的持久化主权
- future `trigger-scheduler` or worker adjunct:
  - 负责 cron/webhook/event source 的后台分发
  - 不拥有 agent lifecycle 主权

### Relationship to existing objects
- `AgentDefinition` 必须引用已发布的 `WorkflowTemplateVersion`
- `publish template` 不会自动创建或激活 `AgentDefinition`
- `activate` 只在通过治理后，将某个 `AgentDefinition` 变为可触发对象
- `manual/message` 触发 path 不要求先存在 `AgentDefinition`
- `schedule/webhook/event_subscription` 不允许绕过 `AgentDefinition` 直接绑定 template/version

### Explicit exclusions
- 不定义 `trigger-scheduler` 的 deployable 形态
- 不定义 secret storage / scope grant schema
- 不定义外部 runtime bridge 的 invoke/callback DTO

## Risks and rollback strategy

### Primary risks
- 把 agent 做成 workflow 的默认运行形态
- 把 trigger configuration 下沉到 runtime
- 把 activate 和 publish 混成一个动作

### Rollback strategy
- 如果 trigger 范围过大，先固定 `manual/message/schedule` 三类
- 如果 agent lifecycle 过深，先固定 `draft -> activatable -> active -> suspended -> retired`

## Open questions
- 首期 `trigger-scheduler` 是否独立 deployable，留待后续实现包决定
