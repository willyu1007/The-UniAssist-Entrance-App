# UniAssist K8s Manifests

These manifests support local kind workflows and staging-oriented validation. They are not a claim that Kubernetes is the only deployment target.

## Non-obvious Caveats

- `base/secret.yaml` contains local-development defaults and must not be treated as production-ready secret handling.
- The bundled `postgres` and `redis` workloads use ephemeral storage and are suitable only for local or demo environments.
- The staging overlay assumes externally managed DB and Redis instances plus secret injection from the target environment.
- Prefer the repo-level scripts for bring-up, teardown, and overlay validation to avoid manual drift.
