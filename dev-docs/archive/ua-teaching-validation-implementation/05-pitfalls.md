# 05 Pitfalls

## Do-not-repeat summary
- 不要把 historical sample validation 做成独立业务 app；它只是平台样例链路。
- 不要保留 `plan/provider-sample/compat-sample` 旧语义别名，避免新旧命名长期并存。
- 不要让 runtime 直接拥有 `RecipeDraft` control-plane SoT。
- 不要为 B3 提前铺一整套控制台查询 API。

## Pitfall log (append-only)
- Pending: 实施过程中如出现关键偏差再追加。
