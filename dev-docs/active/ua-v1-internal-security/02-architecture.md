# 02 Architecture

## Scope boundaries
- In scope:
  - 内部调用认证授权
  - scope 权限矩阵
  - 密钥轮换流程
- Out of scope:
  - 终端用户认证体系

## Security components
- JWT issuer/validator
- Request signature validator
- Scope authorizer
- Key rotation manager

## Protected interfaces
- `/v0/context/users/{profileRef}`
- provider invoke/interact internal calls
- adapter -> gateway ingress

## Key risks
- 服务时钟偏差导致 token 校验失败
- 密钥切换窗口处理不当
