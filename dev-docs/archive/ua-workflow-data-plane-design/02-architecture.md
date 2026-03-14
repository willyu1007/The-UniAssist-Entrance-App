# 02 Architecture

## Context & current state
- 当前 authoritative persistence 仍集中在：
  - `Session`
  - `TimelineEvent`
  - `ProviderRun`
  - `OutboxEvent`
  - `UserContextCache`
- `T-012` 已冻结：runtime 产出 formal events，`ingress-gateway` 负责 timeline/chat compatibility projection。
- 本子包需要解决的问题不是“是否上新表”，而是“哪些对象是正式事实源，哪些对象只是 projection”。

## Proposed design

### Authoritative object inventory
| Domain | Object | Role | P1 decision |
|---|---|---|---|
| Workflow definition | `WorkflowTemplate` | 模板稳定标识 | core |
| Workflow definition | `WorkflowTemplateVersion` | 发布版本与 spec snapshot | core |
| Runtime | `WorkflowRun` | 一次工作流执行的顶层事实对象 | core |
| Runtime | `WorkflowNodeRun` | 单个节点执行事实对象 | core |
| Artifact | `Artifact` | 结构化输出、输入、证据、交付载体 | core |
| Approval | `ApprovalRequest` | 审批等待点 | core |
| Approval | `ApprovalDecision` | 审批结果事实对象 | core |
| Actor graph | `ActorProfile` | 人/组织/班级/小组等参与方的规范化主体 | companion |
| Actor graph | `ActorMembership` | 主体之间的归属/确认关系 | companion |
| Audience | `AudienceSelector` | 从 actor graph 中解析交付受众的选择规则 | companion |
| Delivery | `DeliverySpec` | 交付策略、受众绑定、artifact binding、review gate | companion |
| Delivery | `DeliveryTarget` | 一次运行内解析出的具体交付目标与结果状态 | companion |

### Actor and delivery modeling rules
- 不创建任何场景专属主体表，例如 `teacher`, `student`, `parent` 专属表。
- 不要求 `schema_ref` 作为首版主体扩展机制。
- 采用“固定平台外壳 + 自由 JSON 载荷”模型：
  - 平台治理和关联所需字段保留最小固定列
  - 场景内容进入 `payload_json`
- `ActorProfile` 需要保留最小平台锚点：
  - `id`
  - `workspace_id`
  - `status`
  - `display_name`
  - `actor_type`
  - `payload_json`
  - `created_at`
  - `updated_at`
- `actor_type` 只用于平台级主体分类，例如 `person / org / cohort / workspace / external_contact`，不是教学业务角色。
- `ActorMembership` 同样采用固定外壳 + `payload_json`：
  - `id`
  - `from_actor_id`
  - `to_actor_id`
  - `relation_type`
  - `status`
  - `confirmed_at`
  - `payload_json`
- `relation_type` 保留为固定字段，但首版采用可扩展字符串，而不是严格平台枚举。
- 平台推荐值包括：
  - `member_of`
  - `owns`
  - `responsible_for`
  - `receives_for`
  - `collaborates_with`
- `DeliverySpec` 首版只冻结交付意图，不冻结渠道实现：
  - `audience_selector_id`
  - `review_required`
  - `delivery_mode`
  - `status`
  - `config_json`
- `delivery_mode` 首版限制为 3 个平台值：
  - `manual_handoff`
  - `assisted_delivery`
  - `auto_delivery`
- `DeliverySpec.status` 首版限制为 5 个平台值：
  - `draft`
  - `validated`
  - `active`
  - `superseded`
  - `archived`
- `config_json` 可以承载脱敏、裁剪、排序、交付策略等规则，但不承载微信/邮件/App 等渠道渲染模板。

### Projection inventory
| Projection | Derived from | Owner |
|---|---|---|
| `TimelineEvent` | `WorkflowRun`, `WorkflowNodeRun`, `Artifact`, `Approval*` formal events | `ingress-gateway` |
| `task_question` | `WorkflowNodeRun(waiting_input)` projection | `ingress-gateway` |
| `task_state` | run/node progress projection | `ingress-gateway` |
| runboard summaries | `WorkflowRun`, `WorkflowNodeRun`, `ApprovalRequest`, `DeliveryTarget` | `workflow-platform-api` query surface |
| approval inbox summaries | `ApprovalRequest`, `Artifact`, `ActorProfile` | `workflow-platform-api` query surface |

### Ownership rules
- `Workflow*`, `Artifact`, `Approval*`, `Actor*`, `AudienceSelector`, `Delivery*` 都属于 authoritative store。
- `TimelineEvent`、chat messages、cards、runboard row models 都属于 projection。
- projection 可以被重建；authoritative objects 不可以依赖 projection 回填。

### Lifecycle boundaries

#### `WorkflowRunStatus`
```ts
type WorkflowRunStatus =
  | "created"
  | "running"
  | "waiting_input"
  | "waiting_approval"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";
```

#### `WorkflowNodeRunStatus`
```ts
type WorkflowNodeRunStatus =
  | "created"
  | "scheduled"
  | "running"
  | "waiting_input"
  | "waiting_approval"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";
```

#### `ArtifactState`
```ts
type ArtifactState =
  | "draft"
  | "validated"
  | "review_required"
  | "published"
  | "superseded"
  | "archived";
```

#### `ApprovalRequestStatus`
```ts
type ApprovalRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";
```

#### `ActorMembershipStatus`
```ts
type ActorMembershipStatus =
  | "proposed"
  | "pending_confirmation"
  | "active"
  | "revoked"
  | "expired";
```

#### `AudienceSelectorState`
```ts
type AudienceSelectorState =
  | "draft"
  | "validated"
  | "bound"
  | "superseded"
  | "archived";
```

#### `DeliveryTargetStatus`
```ts
type DeliveryTargetStatus =
  | "pending_resolution"
  | "ready"
  | "blocked"
  | "delivered"
  | "failed"
  | "cancelled";
```

### Why actor/delivery are in `P1`
- 首批协作验证场景必须支持审核后向不同受众 `fan-out`，没有 `AudienceSelector` 和 `DeliverySpec` 就只能退回 ad-hoc 业务字段。
- 临时团队确认、workspace 组队和外部受众解析都依赖最小 actor graph；否则审批人、交付对象和证据归属没有稳定锚点。
- 这些对象被定义为 companion scope，不替换 `T-012` 冻结的核心对象集，而是补足其首批协作场景与控制台所需的数据平面。

### Why not fully free-form JSON objects
- 如果 `ActorProfile`、`ActorMembership`、`DeliverySpec` 连最小固定外壳都没有，审批人解析、受众解析、去重、确认、审计和控制台筛选都会失去稳定 join 点。
- 因此本子包接受业务内容和场景字段自由 JSON，但不接受取消平台治理所需的固定列。

### Relationship rules
- `WorkflowTemplateVersion` 定义节点输出 artifact 的 schema 和可绑定的 `DeliverySpec`。
- `WorkflowRun` 运行时产生 `Artifact`；`DeliverySpec` 引用 artifact class，而不是直接绑定聊天文本。
- `AudienceSelector` 从 `ActorProfile + ActorMembership` 解析出 `DeliveryTarget`。
- `ApprovalDecision` 可以解锁 `Artifact(review_required -> published)`，也可以解锁 `DeliveryTarget(ready -> delivered)`。

### `/v0` compatibility mapping
| Existing `/v0` concept | Authoritative source | Projection owner |
|---|---|---|
| session timeline | `WorkflowRun` + formal events | `ingress-gateway` |
| `task_question` | `WorkflowNodeRun(waiting_input)` | `ingress-gateway` |
| `task_state` | run/node status transitions | `ingress-gateway` |
| provider result card | `Artifact` / `DeliveryTarget` projection | `ingress-gateway` |
| legacy `ProviderRun` | compat execution trace, not workflow source of truth | compat layer |

### Explicit exclusions
- `CompiledCapability`, vector store、long-term memory、knowledge graph 不进入本子包冻结范围。
- 微信/邮件/App 等渠道渲染模板、channel adapter payload schema、外部 connector secret binding 交给后续 `connector-action-layer` 子包。
- `WorkflowDraft` 与 `RecipeDraft` 的控制面对象交给 `builder-draft-sot` 子包。

## Data migration (if applicable)
- Migration steps:
  - 保留当前 `/v0` 表和 outbox 机制
  - 在后续实现任务中新增 workflow/data plane tables
  - 通过 projection 保持 timeline 连续可读
- Backward compatibility strategy:
  - `/v0` 不读取新的 authoritative tables 也不会失效
  - 新 authoritative objects 可逐步映射回现有 timeline
- Rollout plan:
  - 先冻结对象和 ownership
  - 再由后续实现任务落 Prisma schema

## Non-functional considerations
- Security/auth/permissions:
  - actor membership 的确认状态会影响 approver 和 delivery target 是否有效
  - 高风险 delivery spec 需要后续 builder/policy 设计承接
- Performance:
  - projection 可缓存/聚合；authoritative writes 优先正确性与可追溯性
- Observability:
  - 所有 authoritative objects 需可关联 `workflowTemplateVersionId`, `runId`, `nodeRunId`, `artifactId`, `approvalRequestId`, `deliveryTargetId`

## Risks and rollback strategy

### Primary risks
- 把 actor/delivery 过度设计成通用 CRM/通讯录系统
- 让 projection 反向成为 authoritative source
- companion objects 与核心对象边界模糊，导致实现任务重做

### Rollback strategy
- 如果 actor graph 抽象过大，回退到 `ActorProfile + ActorMembership` 最小集合
- 如果 delivery 设计过深，回退到 `DeliverySpec + DeliveryTarget` 的最小交付模型
- 若首批验证场景证据不足，维持 authoritative core，不额外冻结更多 companion objects

## Open questions
- 当前无高影响开放问题；后续若继续细化，优先进入字段级 schema 与索引设计，而不是重开对象边界讨论
