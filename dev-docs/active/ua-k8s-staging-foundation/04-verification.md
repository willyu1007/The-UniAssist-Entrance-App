# 04 Verification

## Automated checks (executed)
1. `kubectl kustomize ops/deploy/k8s/base`
   - Result: PASS
2. `kubectl kustomize ops/deploy/k8s/overlays/kind`
   - Result: PASS
3. `kubectl apply --dry-run=client -k ops/deploy/k8s/overlays/kind`
   - Result: PASS
4. `pnpm typecheck:workspaces`
   - Result: PASS
5. `node .ai/skills/features/iac/scripts/ctl-iac.mjs verify --repo-root .`
   - Result: PASS
6. `node .ai/skills/features/deployment/scripts/ctl-deploy.mjs verify --repo-root .`
   - Result: PASS
7. `pnpm k8s:staging:validate`
   - Result: PASS
8. `kubectl kustomize ops/deploy/k8s/overlays/staging`
   - Result: PASS

## Manual smoke checks (executed)
1. `pnpm k8s:kind:up`
   - Result: PASS
   - Evidence:
     - cluster created: `uniassist-kind`
     - deployments rolled out: `postgres`, `redis`, `provider-sample`, `gateway`, `adapter-wechat`, `worker`
     - services exposed:
       - `gateway` -> `8787:30087/TCP`
       - `adapter-wechat` -> `8788:30088/TCP`
2. `curl http://127.0.0.1:8787/health`
   - Result: PASS (`ok=true`, persistence postgres/redis enabled)
3. `curl http://127.0.0.1:8788/health`
   - Result: PASS
4. gateway ingest + interact + timeline smoke
   - Result: PASS (`/v0/ingest`, `/v0/interact`, `/v0/timeline` 返回预期结构)
5. adapter wechat webhook smoke
   - Result: PASS (`/wechat/webhook` 返回 `ok=true`，成功透传 gateway)
6. staging overlay render spot-check
   - Result: PASS（渲染后仅包含 app 资源，不包含 `postgres/redis`，并正确替换镜像为 `ghcr.io/...:staging-latest`）

## Rollout / Backout
- Rollout:
  - 本地：`pnpm k8s:kind:up`
  - staging：基于 `base` 复制 overlay，替换镜像与 secret 来源后执行 `kubectl apply -k`
- Backout:
  - 本地：`pnpm k8s:kind:down`
  - 手动：`kubectl delete -k ops/deploy/k8s/overlays/kind` + `kind delete cluster --name uniassist-kind`
