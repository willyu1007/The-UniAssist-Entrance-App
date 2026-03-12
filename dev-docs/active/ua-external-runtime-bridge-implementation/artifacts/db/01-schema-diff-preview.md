# 01 Schema Diff Preview

- Command:
  - `DATABASE_URL=postgresql://local:local@127.0.0.1:5432/local pnpm exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20260312173000_repo_prisma_baseline/migration.sql`
- Output:
  - Generated baseline migration at [migration.sql](/Users/phoenix/Desktop/project/The-UniAssist-Entrance-App/prisma/migrations/20260312173000_repo_prisma_baseline/migration.sql)
  - Size: 751 lines
- Relevant B6 coverage inside the baseline:
  - `agent_definitions.bridge_id`
  - `bridge_registrations`
  - `bridge_invoke_sessions`
  - `bridge_callback_receipts`
- Diff mode was read-only against schema SSOT; no target database was mutated.
