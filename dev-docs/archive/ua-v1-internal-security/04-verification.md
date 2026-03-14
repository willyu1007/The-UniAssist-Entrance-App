# 04 Verification

## Automated checks

### 2026-03-04

1. 类型检查

```bash
pnpm typecheck:workspaces
```

结果：PASS

2. conformance（enforce 模式）

```bash
pnpm test:conformance
```

结果：PASS  
覆盖点：
- gateway -> provider `/v0/invoke` / `/v0/interact` internal auth 通过
- `/v0/context/users/:profileRef`：`context:read` 通过，错误 scope 返回 403
- `/v0/events`：`events:write` 通过，错误 scope 返回 403
- 缺失 internal headers 返回 401
- nonce replay 返回 401（`AUTH_REPLAY`）
- audience 不匹配返回 401（`AUTH_AUD_MISMATCH`）
- adapter-wechat -> gateway `/v0/ingest`（外部签名 + internal auth）通过

3. staging verify 脚本语法检查

```bash
node --check ops/deploy/scripts/staging-post-deploy-check.mjs
```

结果：PASS

4. enforce 模式端到端（gateway conformance）

```bash
pnpm test:conformance
```

结果：PASS  
附加覆盖：
- `/v0/events` 缺失 internal headers -> 401
- `/v0/context/users/:profileRef` audience mismatch -> 401
- replay nonce -> 401 (`AUTH_REPLAY`)

5. Redis + Postgres 投递链路端到端（worker smoke）

```bash
DATABASE_URL=postgresql://localhost:5432/uniassist_gateway \
REDIS_URL=redis://localhost:6379 \
pnpm smoke:redis:e2e
```

结果：PASS  
覆盖：
- outbox pending/failed -> consumed
- `NOGROUP` 自动恢复
- dead-letter replay + replay 幂等（`updated: 0`）
- 测试后 DB/Redis 产物清理完成

6. audit 模式端到端（手工）

执行：启动 `provider-sample/gateway/adapter-wechat` 于 `audit` 模式，不携带 internal headers 调用：
- `GET /v0/context/users/profile:audit-user`
- `POST /v0/events`
- `POST /wechat/webhook`

结果：PASS  
行为验证：
- context/events 均返回 200（audit 放行）
- gateway 产生 `AUTH_MISSING` 审计日志（2 条）
- `/v0/metrics` 出现 `internalAuth.requests` 的 `mode=audit,result=audit_allow`
- 相关服务进程和临时数据已清理

## Manual smoke checks
1. 未授权调用被拒绝：本地 conformance 已覆盖关键路径，staging 实网待执行。
2. 低权限 scope 无法访问高权限接口：本地 conformance 已覆盖（403）。
3. 密钥轮换后新旧 token 在窗口内行为符合预期：待 staging 演练留证。

## Rollout / Backout
- Rollout: 先 audit-only 再 enforce。
- Backout: 切回兼容模式并保留审计日志。
