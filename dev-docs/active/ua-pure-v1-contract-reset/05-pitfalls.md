# 05 Pitfalls

## Pitfall 1
- Problem: 把 compat 字段先保留为“临时别名”，导致后续任务继续依赖它们。
- Prevention: `T-033` 直接把主线 contract 语义切到 pure-`v1`，不保留 active alias。

## Pitfall 2
- Problem: 用运行时实现细节倒推 contract，而不是先冻结 contract。
- Prevention: 任何 `T-034` 需要的字段都必须回到 `T-033` 明确命名和语义。

## Pitfall 3
- Problem: OpenAPI、TypeScript types 和 schema planning 各写一套，最后互相漂移。
- Prevention: 本任务的交付必须显式包含三者的一致性说明。
