# UniAssist K8s Manifests

## Layout

- `base/`: 共享基础清单（namespace/config/secret + postgres/redis + gateway/provider-plan/adapter-wechat/worker）
- `overlays/kind/`: kind 本地覆盖（gateway/adapter NodePort）
- `overlays/staging/`: staging 覆盖（外部 DB/Redis、镜像仓库、资源配额）
- `kind/cluster.yaml`: kind 集群配置（把 NodePort 映射到宿主机 8787/8788）

## Local bring-up

```bash
pnpm k8s:kind:up
```

## Local teardown

```bash
pnpm k8s:kind:down
```

## Staging overlay validate

```bash
pnpm k8s:staging:validate
```

通过后可在 staging 集群执行（由人工触发）：

```bash
kubectl apply -k ops/deploy/k8s/overlays/staging
```

## Notes

- `base/secret.yaml` 使用的是本地开发默认值，不能直接用于生产环境。
- `postgres` 与 `redis` 使用 `Deployment + emptyDir`，重建 Pod 后数据会丢失，仅用于本地/演示环境。
- `overlays/staging` 默认删除集群内 `postgres/redis`，要求外部托管实例并通过 `uniassist-secrets` 提供连接串。
