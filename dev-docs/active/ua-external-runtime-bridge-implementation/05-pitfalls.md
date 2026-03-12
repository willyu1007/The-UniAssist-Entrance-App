# 05 Pitfalls (do not repeat)

This file exists to prevent repeating mistakes within this task.

## Do-not-repeat summary (keep current)
- 不要把 external runtime bridge 重新挂回 compat executor env registry。
- 不要让 bridge callback 直接写 platform authoritative tables。
- 不要把 agent 级 bridge binding 塞进 trigger config 或 workflow metadata。
- 不要让非 external-runtime run 静默走 cancel 成功分支。
- 不要在 B6 首版把 bridge-specific API 擅自扩大成通用 executor registry。
- Prisma 的 `validate` / `migrate diff` 即使不写库，也会先检查 `schema.prisma` 里的 `DATABASE_URL`；做 schema-only 校验时要显式提供占位连接串，并在文档里注明“未实际 apply 到数据库”。
