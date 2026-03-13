# 05 Pitfalls

## Pitfall 1
- Problem: 把 legacy 删除拆进前面任务，导致一边实现一边破坏验证基线。
- Prevention: destructive cleanup 只允许在 `T-037` 统一执行。

## Pitfall 2
- Problem: 为了省事保留旧名字当 alias。
- Prevention: `T-037` 的成功标准就是 active mainline 不再保留语义漂移命名。

## Pitfall 3
- Problem: 删除代码但不删文档、脚本、测试和 package metadata。
- Prevention: final grep gate 必须覆盖 code、docs、scripts、tests 和 workspace metadata。
