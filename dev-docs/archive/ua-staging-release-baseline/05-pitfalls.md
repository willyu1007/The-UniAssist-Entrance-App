# 05 Pitfalls

## Do-not-repeat summary
- Postgres SQL 参数运算必须显式类型转换，避免 `unknown + unknown` 运行时错误。

## Resolved issues log
- Date: 2026-02-23
  - Symptom:
    - `release:gate:staging` 执行 conformance 时，gateway 日志报错：
      - `operator is not unique: unknown + unknown`
      - 来源 `saveUserContext` SQL。
  - Root cause:
    - SQL 中 `($4 + $5)` 两个参数均为未显式类型的绑定变量，Postgres 无法解析操作符重载。
  - What was tried:
    - 复现带 `DATABASE_URL` 的 conformance 路径，定位到 `apps/gateway/src/persistence.ts`。
  - Fix/workaround:
    - 改为 `($4::bigint + $5::bigint)` 后再 `to_timestamp(...)`。
  - Prevention note:
    - 所有涉及参数运算的 SQL 均显式 cast，尤其在 `pg` 绑定参数参与算术时。
