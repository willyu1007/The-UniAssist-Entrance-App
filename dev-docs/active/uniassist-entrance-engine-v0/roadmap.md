# UniAssist Entrance Engine Repositioning — Roadmap

## Goal
- 将当前项目升级为“统一入口引擎”，实现多维度专项系统的统一接入、分发编排、交互聚合、长周期事件承载与导航治理。

## Planning-mode context and merge policy
- Runtime mode signal: Default
- User confirmation when signal is unknown: not-needed
- Host plan artifact path(s): (none)
- Requirements baseline: `/Users/yurui/Downloads/需求说明_v0.md`, `/Users/yurui/Downloads/规划方案_v0.md`, `/Users/yurui/Downloads/交互与接入规范_v0.md`
- Merge method: set-union
- Conflict precedence: latest user-confirmed > requirement.md > host plan artifact > model inference
- Repository SSOT output: `dev-docs/active/uniassist-entrance-engine-v0/roadmap.md`
- Mode fallback used: non-Plan default applied: yes

## Input sources and usage
| Source | Path/reference | Used for | Trust level | Notes |
|---|---|---|---|---|
| User-confirmed instructions | Current chat request | 新定位、能力边界、目标输出（roadmap） | highest | 明确要求统一入口承担分发/外部接入/兜底聊天/长周期提示/导航 |
| Requirements doc | `/Users/yurui/Downloads/需求说明_v0.md` | 业务目标、范围边界、FR/NFR | high | 明确 Event Log、Outbox、多命中路由 |
| Requirements doc | `/Users/yurui/Downloads/规划方案_v0.md` | 架构组件、里程碑、实施路径 | high | 提供 M1-M5 实施基线 |
| Requirements doc | `/Users/yurui/Downloads/交互与接入规范_v0.md` | 协议模型、错误模型、幂等与安全要求 | high | 约束 API 与 Provider 接入模型 |
| Existing roadmap | `dev-docs/active/uniassist-entrance-engine-v0/roadmap.md` | 更新基线 | medium | 仅作为草案输入，已按 plan-maker 模板重排 |
| Model inference | N/A | 仅用于补充阶段组织与讨论议程 | lowest | 不覆盖文档与用户明确约束 |

## Non-goals
- 不在入口项目承载专项业务领域逻辑与领域数据存储
- 不在 v0 一次性完成全量平台级 RAG/向量基础设施
- 不以同步接口返回完整多 Provider 结果替代事件流
- 不在 v0 放开医疗诊断类输出

## Open questions and assumptions
### Open questions (answer before execution)
- Q1: 用户身份打通策略如何确定（App 账户与微信 identity 的映射与绑定规则）？
- Q2: 会话策略是否跨渠道共享（按用户统一 session）还是默认分渠道隔离？
- Q3: v0 首批专项系统是否固定为 `plan + work`？
- Q4: 微信接入 v0 范围是否仅“入站+文本回传”，还是包含图文菜单完整映射？
- Q5: 医疗维度在 v0 的硬性边界文案是否由统一策略中心维护？

### Assumptions (if unanswered)
- A1: 系统级 SoT 固定为 Gateway Event Log，App 为投影视图（risk: low）
- A2: 主链路采用 ACK + runId + 事件流增量返回（risk: low）
- A3: v0 外部渠道优先接入微信，至少保证入站闭环（risk: medium）
- A4: 首批专项系统至少 2 个，且都遵循 manifest/invoke/interact/events 契约（risk: medium）

## Merge decisions and conflict log
| ID | Topic | Conflicting inputs | Chosen decision | Precedence reason | Follow-up |
|---|---|---|---|---|---|
| C1 | 路线图粒度 | 规范文档细节较深 vs 用户要求 roadmap | 保持宏观里程碑与验收口径，细节下沉到后续设计文档 | 用户目标是“先 roadmap 再讨论” | 评审后输出详细 `01-plan.md/02-architecture.md` |
| C2 | 里程碑起点 | 规划文档从 M1 开始 vs 当前需要先对齐关键决策 | 增加 M0（对齐与契约冻结）再进入 M1 | 执行风险控制优先 | M0 结束后再锁定实现排期 |

## Scope and impact
- Affected areas/modules:
  - `apps/frontend`（时间线、交互回传、Inbox、导航）
  - `apps/gateway`（新增，ingest/router/orchestrator/event/log/delivery）
  - `apps/adapter-wechat`（可选新增，外部渠道适配）
  - `packages/contracts`（新增，协议与 schema）
  - `packages/sdk`（可选新增，Provider 接入 SDK）
- External interfaces/APIs:
  - `/v0/ingest`
  - `/v0/interact`
  - `/v0/stream`
  - `/v0/events`
  - Provider `.well-known/uniassist/manifest.json`
- Data/storage impact:
  - 新增 Engine DB 表（sessions/timeline_events/provider_runs/routing_decisions/outbox 等）
  - 新增对象存储附件元数据管理
  - 新增 Redis Streams 消费组
- Backward compatibility:
  - 当前 App 可保留基础聊天能力作为 fallback
  - 协议采用 `v0` 版本化，要求消费者忽略未知字段

## Consistency baseline for dual artifacts (if applicable)
- [x] Goal is semantically aligned with host plan artifact
- [x] Boundaries/non-goals are aligned
- [x] Constraints are aligned
- [x] Milestones/phases ordering is aligned
- [x] Acceptance criteria are aligned
- Intentional divergences:
  - 新增 M0 以先完成决策门与契约冻结

## Project structure change preview (may be empty)
This section is a **non-binding, early hypothesis** to help humans confirm expected project-structure impact.

### Existing areas likely to change (may be empty)
- Modify:
  - `apps/frontend/`
  - `dev-docs/`
  - `.ai/project/main/`（治理状态与任务映射）
- Delete:
  - (none)
- Move/Rename:
  - (none)

### New additions (landing points) (may be empty)
- New module(s) (preferred):
  - `apps/gateway/`
  - `packages/contracts/`
  - `apps/adapter-wechat/`（若 v0 纳入）
  - `apps/worker/`（可选，或并入 gateway）
- New interface(s)/API(s) (when relevant):
  - `/v0/ingest`
  - `/v0/interact`
  - `/v0/stream`
  - `/v0/events`
- New file(s) (optional):
  - `packages/contracts/schemas/v0/*.schema.json`
  - `packages/contracts/src/*.ts`

## Phases
1. **Phase 1**: M0 对齐与契约冻结
   - Deliverable: v0 协议、边界与验收口径达成一致
   - Acceptance criteria: 关键决策门（身份、session、首批维度、渠道范围、医疗边界）可执行
2. **Phase 2**: M1 App 交互运行时闭环
   - Deliverable: App 完成结构化交互渲染与回传闭环（mock provider）
   - Acceptance criteria: 多命中、澄清、fallback 流程可用
3. **Phase 3**: M2 Gateway 核心闭环
   - Deliverable: ingest/router/orchestrator/event-log/stream/outbox 最小可用
   - Acceptance criteria: 快速 ACK + 增量事件 + 断线恢复成立
4. **Phase 4**: M3 真实 Provider 与附件链路
   - Deliverable: 至少一个真实专项系统 + 附件跨系统链路打通
   - Acceptance criteria: 真实 run 可追踪，结构化交互可展示
5. **Phase 5**: M4 长周期事件与投递
   - Deliverable: DomainEvent -> Inbox/通知/渠道投递闭环
   - Acceptance criteria: 长周期提示可靠触达且可审计
6. **Phase 6**: M5 治理与规模化准备
   - Deliverable: conformance、安全基线、可观测基线
   - Acceptance criteria: 新 Provider 标准化接入无需修改引擎核心流程

## Step-by-step plan (phased)
> Keep each step small, verifiable, and reversible.

### Phase 0 — Discovery (if needed)
- Objective: 统一术语、识别冲突、确认执行边界与优先级。
- Deliverables:
  - 决策门清单（5 项开放问题）
  - v0 范围冻结清单
  - 首批 Provider/渠道候选列表
- Verification:
  - 评审会议纪要对关键决策给出明确结论
- Rollback:
  - N/A (planning-only)

### Phase 1 — M0 对齐与契约冻结
- Objective: 固化协议与架构不变前提，避免后续返工。
- Deliverables:
  - contracts 目录骨架与 schema 列表
  - API surface 与错误码清单
  - conformance checklist v0
- Verification:
  - schema 可通过校验
  - 协议版本字段与兼容策略在文档中闭环
- Rollback:
  - 若冻结失败，回退到仅保留核心字段并降低首批接入范围

### Phase 2 — M1 App 交互运行时闭环
- Objective: 先确保用户可见体验闭环。
- Deliverables:
  - InteractionEvent 渲染组件完善
  - UserInteraction 回传链路
  - request_clarification + fallback 聊天流程
- Verification:
  - App 内“输入 -> 多命中 -> 交互回传 -> 继续执行”可演示
- Rollback:
  - 保留现有聊天页为降级路径

### Phase 3 — M2 Gateway 核心闭环
- Objective: 建立系统级事实源与实时链路。
- Deliverables:
  - gateway v0 APIs
  - event_log + outbox + streams
  - ws/sse 订阅与 cursor 恢复
- Verification:
  - ACK 延迟、事件序列、断线恢复达到预期
- Rollback:
  - 关闭多 Provider 并发，回退到单 provider 路径

### Phase 4 — M3 真实 Provider 与附件链路
- Objective: 从 mock 过渡到真实专项系统价值输出。
- Deliverables:
  - 真实 Provider 接入
  - manifest registry
  - 附件对象存储 + 元数据
- Verification:
  - 文本与附件输入在真实 provider 成功处理并展示
- Rollback:
  - provider 临时降级到 mock/builtin_chat

### Phase 5 — M4 长周期事件与投递
- Objective: 打通长期任务反馈与多端触达。
- Deliverables:
  - DomainEvent 接入与 inbox projector
  - App Inbox + 外部渠道至少一种投递
  - delivery 重试与审计记录
- Verification:
  - 长周期事件在 App 与渠道可见，失败可重试
- Rollback:
  - 外部渠道故障时仅保留 App 内投递

### Phase 6 — M5 治理、安全与可扩展
- Objective: 标准化接入、提高可靠性与可运维性。
- Deliverables:
  - conformance test suite
  - provider onboarding playbook
  - auth/signature/observability baseline
- Verification:
  - 新 provider 接入演练通过
  - 关键链路告警可触发并定位
- Rollback:
  - 暂停新增 provider，保留已通过 conformance 的接入

## Verification and acceptance criteria
- Build/typecheck:
  - `pnpm typecheck`
  - `pnpm --filter @baseinterface/frontend typecheck`
- Automated tests:
  - Provider conformance tests（待补充命令）
  - Gateway API contract tests（待补充命令）
- Manual checks:
  - App 输入后应立即显示可渲染 ACK
  - 多命中时可看到并发进展与澄清交互
  - 断线重连后 timeline 无丢失与明显乱序
  - DomainEvent 能进入 Inbox 并可跳转关联详情
- Acceptance criteria:
  - 至少 2 个专项系统接入通过 conformance
  - 至少 1 个外部渠道形成闭环
  - 关键事件可追踪到 traceId/runId/providerId 维度

## Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Detection | Rollback |
|---|---:|---:|---|---|---|
| 契约漂移导致多方返工 | medium | high | contracts + schema CI + conformance gate | schema 校验失败率上升 | 冻结新增字段，仅允许兼容修订 |
| 事件重复/乱序影响体验 | medium | high | eventId 去重 + seq + idempotencyKey | timeline 出现重复与顺序异常 | 暂时降级为单 provider 串行输出 |
| 渠道能力差异导致交互降级 | high | medium | adapter 映射层 + 渠道专属降级模板 | 渠道回传失败率上升 | 关闭复杂交互，仅回传文本摘要 |
| 医疗维度输出越界 | medium | high | policy 开关 + 强提醒模板 + 审计 | 抽检出现违规文案 | 临时停用医疗 provider 输出 |
| 入口侵入专项业务边界 | medium | high | 数据归属与接口边界强约束 | 引擎出现领域特定表/逻辑 | 回收到 provider 侧，入口保留编排层 |

## Optional detailed documentation layout (convention)
If you maintain a detailed dev documentation bundle for the task, the repository convention is:

```
dev-docs/active/<task>/
  roadmap.md              # Macro-level planning (plan-maker)
  00-overview.md
  01-plan.md
  02-architecture.md
  03-implementation-notes.md
  04-verification.md
  05-pitfalls.md
```

The roadmap document can be used as the macro-level input for the other files. The plan-maker skill does not create or update those files.

Suggested mapping:
- The roadmap's **Goal/Non-goals/Scope** -> `00-overview.md`
- The roadmap's **Phases** -> `01-plan.md`
- The roadmap's **Architecture direction (high level)** -> `02-architecture.md`
- Decisions/deviations during execution -> `03-implementation-notes.md`
- The roadmap's **Verification** -> `04-verification.md`

## To-dos
- [ ] Confirm planning-mode signal handling and fallback record
- [ ] Confirm input sources and trust levels
- [ ] Confirm merge decisions and conflict log entries
- [ ] Confirm open questions
- [ ] Confirm phase ordering and DoD
- [ ] Confirm verification/acceptance criteria
- [ ] Confirm rollout/rollback strategy
