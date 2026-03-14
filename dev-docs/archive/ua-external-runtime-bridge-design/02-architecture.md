# 02 Architecture

## Context & current state
- 当前平台骨架假设存在 executor invoke path，但还没有明确外部 runtime bridge 的正式对象与 handoff。
- 设计记录明确要求“借鉴外部 runtime 语义，但平台不等于外部 runtime”。

## Proposed design

### Core definitions
| Concept | Responsibility | Explicitly not responsible for |
|---|---|---|
| `ExternalRuntimeBridge` | 将外部 runtime 适配为平台可调用执行体 | 成为平台 control plane |
| `BridgeRegistration` | 记录 bridge identity、capability、health、activation；归属于 executor/capability registry | 直接拥有 workflow template |
| `BridgeInvokeSession` | 一次外部 runtime 调用的关联上下文 | 成为 authoritative run record |
| `BridgeCallback` | 将 normalized `checkpoint/result/error/approval_requested` envelope 回传平台 | 直接修改 workflow state machine |

### Registry boundary
- `ExternalRuntimeBridge` 首版明确归属 executor/capability 体系，而不是 connector registry。
- 原因：
  - 它桥接的是执行语义，不是外部业务系统 action/event surface
  - 它不应进入 `ConnectorDefinition / ActionDefinition / EventBridge` 那组对象边界
  - 否则 external runtime 和 connector 会重新混义

### Ownership rules
- `workflow-platform-api`:
  - 管 bridge registration / activation
  - 校验 bridge 是否允许被调用
- `workflow-runtime`:
  - 决定何时 invoke bridge
  - 决定如何消费 callback 形成状态转移
  - 负责把 normalized envelope 物化为正式对象
- `worker`:
  - 承接异步 callback、retry、recovery
- external runtime bridge:
  - 提供 invoke/callback/checkpoint 兼容层
  - 只回传 normalized envelopes
  - 不拥有 artifact/approval/delivery authoritative store

### Command and callback contract
- command set:
  - `invoke`
  - `resume`
  - `cancel`
- callback set:
  - `checkpoint`
  - `result`
  - `error`
  - `approval_requested`
- 其他运行结果如 artifact emission、delivery readiness、diagnostic payload：
  - 首版不扩展为新的 callback type
  - 统一放进 `checkpoint` 或 `result` envelope 载荷

### Handoff contract
- command path:
  - `workflow-runtime` -> bridge (`invoke/resume/cancel`)
- callback path:
  - bridge -> runtime callback endpoint (`checkpoint/result/error/approval_requested`)
- formal object creation:
  - bridge 只能报告 normalized envelopes
  - `workflow-runtime` 根据 envelope 创建/更新：
    - `WorkflowNodeRun`
    - `Artifact`
    - `ApprovalRequest`
    - `DeliveryTarget`

### Why the bridge is not the platform
- 外部 runtime 可以提供更强的 agent/tool/execution 语义。
- 但平台仍然需要统一的：
  - workflow template/version
  - governance
  - artifact/approval/delivery authoritative store
  - audit / replay / lineage

### Explicit exclusions
- 不定义具体 vendor DTO
- 不定义 trigger activation
- 不定义 connector binding policy

## Risks and rollback strategy

### Primary risks
- bridge 越界成第二个 workflow runtime
- callback 直接写正式对象，绕过平台
- platform API 与 runtime 的 owner 被外部 runtime 侵蚀

### Rollback strategy
- 如果 bridge 能力范围过大，先只支持 invoke + result callback
- 如果 formal object handoff 过深，先只允许 bridge 回传结构化 result envelope，再由 runtime 解包

## Open questions
- bridge protocol 是否单独拆包，留待后续实现设计决定
