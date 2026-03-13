# 05 Pitfalls

## Pitfall 1
- Problem: 把控制台重新做成聊天入口的 UI 外壳。
- Prevention: `T-035` 只围绕 operator/studio objects 设计，不引入 chat intake。

## Pitfall 2
- Problem: 页面为了方便直接消费内部 runtime 或 projection 数据源。
- Prevention: 所有页面只走 `workflow-platform-api` 暴露的 pure-`v1` surface。

## Pitfall 3
- Problem: Studio 过早膨胀成复杂画布或全量后台。
- Prevention: 先保住 draft/spec/operator flows，不扩到全量 admin。
