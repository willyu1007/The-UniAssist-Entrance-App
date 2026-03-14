# IaC SSOT (terraform)

This directory is the repository SoT for Terraform-managed infrastructure definitions. It does not replace deployment manifests under `ops/deploy/k8s`, which remain deployment assets rather than Terraform state.

- Plan/apply is owned by humans/CI.
- Do NOT store secrets here.
- Keep environment injection and IaC responsibilities separate.
