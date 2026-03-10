# 02 Architecture

## Context & current state
- 现有规划已经明确了“publish 不等于 activate/bind/schedule/external write”，但还没有冻结正式治理对象。
- connector 和未来 external runtime 都需要 secret/scope/policy 收口，否则平台无法建立统一 trust boundary。

## Proposed design

### Core definitions
| Concept | Responsibility | Explicitly not responsible for |
|---|---|---|
| `ApprovalRequest` | 作为唯一正式审批账本，承载治理型高风险动作的审批请求 | 直接执行 runtime state transition |
| `ApprovalDecision` | 作为唯一正式审批结果账本，记录 approve/reject/revoke/expire 结果 | 代替业务 artifact 或 runtime state |
| `SecretRef` | 对受管 secret 的间接引用 | 暴露明文凭证 |
| `ScopeGrant` | 对某一 capability/connector/agent 的范围授权 | 存储实际业务结果 |
| `PolicyBinding` | 统一 policy 外壳，将 policy profile 绑定到 template/agent/connector/action | 代替 invoke contract |

### Approval authority rule
- 不新建第二套 `GovernanceRequest / GovernanceDecision` authoritative objects。
- 高风险治理动作继续复用 `ApprovalRequest / ApprovalDecision` 作为唯一正式审批账本。
- “governance request” 在本子包中是逻辑语义，不再是与 `T-018` 并行的第二套数据模型。

### Privileged action matrix
| Action | Default |
|---|---|
| `publish template` | broad allow |
| `activate agent/capability` | governed |
| `bind secret/connector` | governed |
| `enable schedule or event trigger` | governed |
| `allow external write` | governed |
| `widen scope/environment reach` | governed |

### `PolicyBinding` shell
- `PolicyBinding` 首版采用统一外壳，不拆成 approval/invoke/delivery 各自独立对象。
- 建议保留最小固定列：
  - `id`
  - `workspace_id`
  - `policy_kind`
  - `target_ref`
  - `status`
  - `config_json`
- `policy_kind` 首版建议值：
  - `approval`
  - `invoke`
  - `delivery`
  - `visibility`
  - `browser_fallback`

### Ownership rules
- `workflow-platform-api`:
  - 创建治理请求
  - 校验 policy binding
  - 下发经过批准的 grant/ref
- `workflow-runtime`:
  - 只消费批准结果
  - 不持有 secret/policy registry
- connector / external runtime bridge:
  - 只接收允许范围内的 binding/grant
  - 不反向成为 secret/policy authority

### `SecretRef` model
- `SecretRef` 首版采用 workspace 主权 + environment overlay。
- 建议最小固定列：
  - `id`
  - `workspace_id`
  - `environment_scope`
  - `provider_type`
  - `status`
  - `metadata_json`
- 解释：
  - 主 secret ownership 归 `workspace`
  - 可附加 `environment_scope`，例如 `dev/staging/prod`
  - project/agent/connector 的可用性由 binding/grant 决定，而不是把 secret 主权下放给它们

### Lifecycle sketches
```ts
type ApprovalRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";
```

- `ApprovalRequestStatus` 首版严格复用 `T-018` 已冻结的 canonical status set。
- 如果后续确实需要“draft governance request”之类的预提交态，应放在 UI/control-plane draft 层，而不是重写 authoritative `ApprovalRequest` 状态机。

```ts
type ScopeGrantStatus =
  | "pending"
  | "active"
  | "revoked"
  | "expired";
```

### Explicit exclusions
- 不定义 vault/KMS/provider 选型
- 不定义完整 policy DSL
- 不定义 UI form 或 admin console

## Risks and rollback strategy

### Primary risks
- secret 与 scope 继续散落到执行体内部
- governance request 被弱化成普通审批备注
- policy 粒度一次性设计过深

### Rollback strategy
- 如果 policy object 过多，先收敛到 `ApprovalRequest + ApprovalDecision + SecretRef + ScopeGrant + PolicyBinding`
- 如果 scope 语义过深，先保留 binding-time allow/reject 和 revoke/expire

## Open questions
- `ScopeGrant` 是否需要区分 capability-grant 与 environment-grant 子类，留待后续设计评审收敛
