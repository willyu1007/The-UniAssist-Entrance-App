# 00 Overview

## Status
- State: in-progress
- Next step: 在 staging 以 `audit` 模式联调后切 `enforce`，并完成一次 `kid` 轮换演练留证。

## Goal
把当前 v0 最低安全升级到 v1：内部调用默认不信任，按身份与 scope 严格鉴权。

## Non-goals
- 不做用户侧登录体系重构。
- 不在本任务引入医疗策略中心。

## Context
- v0 仅要求外部入口签名+防重放。
- 内部 gateway/provider/adapter/worker 仍需统一认证授权机制。

## Acceptance criteria (high level)
- [x] 内部请求必须携带有效签名/JWT。
- [x] provider 调用按 scope 最小授权。
- [x] 关键拒绝场景有可观测日志。
- [ ] 密钥轮换流程可演练。
