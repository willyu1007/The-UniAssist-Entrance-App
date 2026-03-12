# Env Contract Validation

- Timestamp (UTC): `2026-03-12T22:30:59Z`
- Root: `/Users/phoenix/Desktop/project/The-UniAssist-Entrance-App`
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
      "secrets_ref_file": "/Users/phoenix/Desktop/project/The-UniAssist-Entrance-App/env/secrets/dev.ref.yaml",
      "used_secret_refs": [],
      "values_file": "/Users/phoenix/Desktop/project/The-UniAssist-Entrance-App/env/values/dev.yaml",
      "values_keys": [
        "PORT",
        "SERVICE_NAME",
        "UNIASSIST_ENABLE_CONVEX_RUNBOARD_EXPERIMENT"
      ]
    },
    "prod": {
      "secret_ref_keys": [],
      "secrets_ref_file": "/Users/phoenix/Desktop/project/The-UniAssist-Entrance-App/env/secrets/prod.ref.yaml",
      "used_secret_refs": [],
      "values_file": "/Users/phoenix/Desktop/project/The-UniAssist-Entrance-App/env/values/prod.yaml",
      "values_keys": [
        "PORT",
        "SERVICE_NAME"
      ]
    },
    "staging": {
      "secret_ref_keys": [],
      "secrets_ref_file": "/Users/phoenix/Desktop/project/The-UniAssist-Entrance-App/env/secrets/staging.ref.yaml",
      "used_secret_refs": [],
      "values_file": "/Users/phoenix/Desktop/project/The-UniAssist-Entrance-App/env/values/staging.yaml",
      "values_keys": [
        "PORT",
        "SERVICE_NAME"
      ]
    }
  },
  "variables_non_secret": 5,
  "variables_secret": 0,
  "variables_total": 5
}
```

## Notes
- This report never includes secret values.
- If this is used in CI, treat any ERROR as a merge blocker.
