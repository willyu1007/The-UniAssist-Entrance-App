# 05 Pitfalls

## Do-not-repeat summary
- conformance 场景中若命中未配置 provider（如 `work/reminder`），gateway 会进入 fallback `task_question`，导致后续 ingest 走 pending 早返回路径，影响会话漂移与切换相关断言稳定性。
- 多 pending 场景不能通过重复 ingest 直接构造（单 pending 会被自动转发），需通过 `/v0/events` 注入额外 `task_question` 线程来验证澄清分支。

## Resolved issues log
1. Frontend `provider_extension` 联合类型扩展后，旧代码直接读取 `payload.values` 导致 typecheck 失败。  
Fix: 按 `extensionKind` 分支渲染并为 legacy 分支加窄化判断。

2. conformance 旧断言仍依赖 `data_collection_*`，与 T-009 协议不匹配。  
Fix: 改为 `task_question/task_state` + `replyToken` + `ready->execute` 全链路断言。

3. 主题漂移用例反复超时。  
Root cause: 样本命中未配置 provider 后生成 pending task，后续 ingest 走 pending 分支，跳过漂移逻辑。  
Fix: 漂移用例改为无专项关键词文本，避免 pending 干扰。

4. “自动建议切换 provider”在本地环境不稳定。  
Root cause: 未配置 provider 的 fallback task 态改变分发轨迹。  
Fix: conformance 保留“手动 switch_provider 动作”验证，不将自动建议作为硬断言。
