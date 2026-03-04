# UniAssist K8s Manifests

## Layout

- `base/`: 共享基础清单（namespace/config/secret + postgres/redis + gateway/provider-plan/adapter-wechat/worker）
- `overlays/kind/`: kind 本地覆盖（gateway/adapter NodePort）
- `kind/cluster.yaml`: kind 集群配置（把 NodePort 映射到宿主机 8787/8788）

## Local bring-up

```bash
pnpm k8s:kind:up
```

## Local teardown

```bash
pnpm k8s:kind:down
```

## Notes

- `base/secret.yaml` 使用的是本地开发默认值，不能直接用于生产环境。
- `postgres` 与 `redis` 使用 `Deployment + emptyDir`，重建 Pod 后数据会丢失，仅用于本地/演示环境。
