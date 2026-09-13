# AGENTS.md — prisma/ (database schema & migrations)

> Auto-loaded when the agent works under `prisma/`. Inherits the root [AGENTS.md](../AGENTS.md).

## Read first

- [docs/architecture/data-model.md](../docs/architecture/data-model.md) — the executable data model (tables, keys, indexes)
- [docs/architecture/invariants.md](../docs/architecture/invariants.md) — invariants + physical DB constraints (§7.4)
- [docs/architecture/state-transitions.md](../docs/architecture/state-transitions.md) — the 5 status axes the schema must support

## Rules

- Schema changes ONLY through versioned, forward-only migrations
  (`npx prisma migrate dev --name <change>`). Never edit an already-applied migration.
- Anything Prisma cannot express — partial indexes, CHECK constraints, generated columns,
  triggers, `ON CONFLICT` behavior — lives in raw SQL migration files. This is also why
  integration tests MUST run on real PostgreSQL, never SQLite.
- Money columns are BIGINT Rials. Every business table is scoped by `organization_id`
  (composite keys/FKs where the model says so).
- Before migrating financial tables: snapshot first — see
  [docs/runbooks/backup-restore.md](../docs/runbooks/backup-restore.md).
- Drift between `schema.prisma` and the live DB fails CI (`npx prisma migrate diff`).
- Rollback path = restore + runbook ([docs/runbooks/rollback.md](../docs/runbooks/rollback.md)),
  never `git revert` of a migration.
- Human review is mandatory for every migration (master spec §13.7).
