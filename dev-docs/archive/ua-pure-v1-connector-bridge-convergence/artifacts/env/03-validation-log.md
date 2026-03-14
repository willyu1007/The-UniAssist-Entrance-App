# Env Contract Validation

- Timestamp (UTC): `2026-03-14T04:48:34Z`
- Root: `/Volumes/DataDisk/Project/The-UA-Entrance-APP`
- Envs: `dev, prod, staging`
- Status: **PASS**

## Errors
- (none)

## Warnings
- (none)

## Summary (redacted)
```json
{
  "per_env": {
    "dev": {
      "secret_ref_keys": [],
      "secrets_ref_file": "/Volumes/DataDisk/Project/The-UA-Entrance-APP/env/secrets/dev.ref.yaml",
      "used_secret_refs": [],
      "values_file": "/Volumes/DataDisk/Project/The-UA-Entrance-APP/env/values/dev.yaml",
      "values_keys": [
        "PORT",
        "SERVICE_NAME",
        "UNIASSIST_ENABLE_CONVEX_RUNBOARD_EXPERIMENT"
      ]
    },
    "prod": {
      "secret_ref_keys": [],
      "secrets_ref_file": "/Volumes/DataDisk/Project/The-UA-Entrance-APP/env/secrets/prod.ref.yaml",
      "used_secret_refs": [],
      "values_file": "/Volumes/DataDisk/Project/The-UA-Entrance-APP/env/values/prod.yaml",
      "values_keys": [
        "PORT",
        "SERVICE_NAME"
      ]
    },
    "staging": {
      "secret_ref_keys": [],
      "secrets_ref_file": "/Volumes/DataDisk/Project/The-UA-Entrance-APP/env/secrets/staging.ref.yaml",
      "used_secret_refs": [],
      "values_file": "/Volumes/DataDisk/Project/The-UA-Entrance-APP/env/values/staging.yaml",
      "values_keys": [
        "PORT",
        "SERVICE_NAME"
      ]
    }
  },
  "variables_non_secret": 6,
  "variables_secret": 0,
  "variables_total": 6
}
```

## Notes
- This report never includes secret values.
- If this is used in CI, treat any ERROR as a merge blocker.
