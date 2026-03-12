# 05 Pitfalls

## Do-not-repeat summary
- 不要让 control-console 绕过 `workflow-platform-api` 直连 runtime 或 DB。
- 不要把 `Workflow Studio` 误做成 canvas editor 或 merge/conflict 系统。
- 不要为了实时刷新引入第二套 projection store；先用 invalidation + refetch。

## Historical notes
- Internal auth signing originally used the full path including query string on `runtime-client` GETs, while runtime verification checks `req.path`. This broke signed query routes such as `/internal/runtime/runs?limit=...`; B4 fixed it by signing the path without query.
- 独立 Vite app 直连 `workflow-platform-api` 时会遇到浏览器 CORS 阻塞；B4 增加了最小 northbound CORS middleware，避免控制台只能在测试环境工作。
- `ui/styles/ui.css` 自身的 `@import` 顺序不适合直接被 Vite/PostCSS 二次 `@import`；control-console 改为在 `main.tsx` 直接引入 `tokens.css + contract.css`，并在 app `styles.css` 内声明 layer 顺序和 reset。
- SSE fallback 测试如果强行绑定 React Query 的真实 interval，会在 fake timers 下变得脆弱。最终改成验证 stream state 与 adaptive polling interval 切换，覆盖同一机制但保持测试稳定。
