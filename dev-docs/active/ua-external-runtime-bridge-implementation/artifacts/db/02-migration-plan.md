# 02 Migration Plan

- Strategy: commit a repo baseline migration first, defer real DB apply.
- For a brand-new database:
  - apply baseline with `prisma migrate deploy` after environment approval.
- For an existing database already created outside Prisma migrations:
  - do not blindly run the baseline migration
  - first baseline/resolve `_prisma_migrations` against the existing schema, then apply later migrations
- Rollback expectation:
  - this pass changed only repo artifacts and context contracts; rollback is git revert, not DB rollback.
