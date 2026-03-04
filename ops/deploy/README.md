# Deploy

Goal: run packaged services/jobs in target environments with repeatable procedures.

## Structure

- `ops/deploy/staging/env.example` - baseline staging environment variables.
- `ops/deploy/staging/runbook.md` - release + verify + rollback handbook.
- `ops/deploy/k8s/base` - reusable k8s base manifests (namespace/config/secret + all workloads).
- `ops/deploy/k8s/overlays/kind` - kind-local overlay (NodePort exposure).
- `ops/deploy/k8s/kind/cluster.yaml` - kind cluster config with host port mappings.
- `ops/deploy/scripts/k8s-kind-up.mjs` - build images + create cluster + apply manifests + rollout checks.
- `ops/deploy/scripts/k8s-kind-down.mjs` - delete k8s resources and destroy kind cluster.
- `ops/deploy/scripts/staging-release-gate.mjs` - pre-release quality gate.
- `ops/deploy/scripts/staging-post-deploy-check.mjs` - post-release health and path checks.
- `ops/deploy/scripts/staging-worker-reliability-drill.mjs` - worker chaos/recovery drill (simulate/live).

## Principles

- Keep deployment steps deterministic.
- Treat rollback as a first-class path, not a fallback thought.
- Run gate checks before any rollout.

## Local Kubernetes (kind)

Prerequisites:
- Docker
- kind
- kubectl

Bring up local cluster:

```bash
pnpm k8s:kind:up
```

This script will:
- build four local images (`gateway`, `provider-plan`, `adapter-wechat`, `worker`)
- create `uniassist-kind` cluster (if absent)
- load images into cluster
- apply `ops/deploy/k8s/overlays/kind`
- wait for rollout of postgres/redis and all app deployments
- verify `http://127.0.0.1:8787/health` and `http://127.0.0.1:8788/health`

Teardown:

```bash
pnpm k8s:kind:down
```
