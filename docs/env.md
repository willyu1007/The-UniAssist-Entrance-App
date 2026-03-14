# Environment Configuration

This document is generated from `env/contract.yaml`. Do not hand-edit.

Generated at (UTC): `2026-03-14T04:48:34Z`

## Environments
- `dev`, `prod`, `staging`

## Variables

| Name | State | Type | Required | Secret | Default | Secret Ref | Scopes | Deprecate After | Replacement | Rename From | Description |
|---|---:|---:|:---:|:---:|---|---|---|---|---|---|---|
| `APP_ENV` | `active` | `enum` | yes | no | `dev` | `` | `*` | `` | `` | `` | Deployment environment profile. |
| `PORT` | `active` | `int` | yes | no | `8000` | `` | `*` | `` | `` | `` | Service listen port. |
| `SERVICE_NAME` | `active` | `string` | yes | no | `your-service` | `` | `*` | `` | `` | `` | Service name (logical). |
| `UNIASSIST_CONNECTOR_REGISTRY_JSON` | `active` | `string` | no | no | `` | `` | `*` | `` | `` | `` | JSON deployment manifest for connector-runtime and workflow-platform-api, listing connectorKey/packageName/exportName/enabled entries that this deployment may load. |
| `UNIASSIST_CONVEX_URL` | `active` | `string` | no | no | `` | `` | `*` | `` | `` | `` | Convex deployment URL consumed by the B9 runboard projection experiment. |
| `UNIASSIST_ENABLE_CONVEX_RUNBOARD_EXPERIMENT` | `active` | `bool` | no | no | `False` | `` | `*` | `` | `` | `` | Enable the B9 Convex-backed runboard summary experiment inside workflow-platform-api. |

## Loading model (recommended)

1. Runtime injection (cloud)
2. Local .env.local (gitignored)
3. env/values/<env>.yaml
4. env/contract.yaml defaults

## Secret handling rules

- Secret values must never be committed to the repository.
- Secret variables are defined in the contract with `secret: true` and `secret_ref`.
- Secret refs are stored in `env/secrets/<env>.ref.yaml`.
