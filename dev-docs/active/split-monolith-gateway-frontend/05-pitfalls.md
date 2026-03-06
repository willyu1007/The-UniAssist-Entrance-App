# 05 Pitfalls

## do-not-repeat
- 现象：Gateway 首轮 typecheck 在 auth observability 与 emitProviderEvents 回调签名处失败。
- 根因：拆分后使用了宽泛的 `string` 签名，和原有严格 union 类型不匹配。
- 处理：将 `observeInternalAuthRequest` 与 route callback 参数改回严格 union/`InteractionEvent[]`。
- 预防：拆分跨模块回调时优先复用原始类型定义，不要手写宽泛占位类型。
