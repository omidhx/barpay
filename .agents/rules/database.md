---
globs: prisma/**, src/lib/db/**
description: Database & migration rules (PostgreSQL-only, forward-only, physical constraints)
---

# Database Rules

- PostgreSQL 16+ ONLY (MySQL is not an option). Partial unique indexes, CHECK
  constraints, generated columns, and triggers are REQUIRED and live in raw SQL
  migration files — Prisma schema cannot express them.
- Migrations are versioned, forward-only (`prisma migrate`). No manual SQL on
  production. CI runs `prisma migrate diff` on every PR; drift breaks the build.
- Hazardous changes follow expand-contract: add compatible column/table →
  deploy code → backfill (chunked, idempotent) → drop old. Live-table indexes
  use `CREATE INDEX CONCURRENTLY`; new CHECKs use `NOT VALID` then `VALIDATE`.
- Any migration touching `payments`, `payment_refunds`, `waybill_amounts`, or
  `audit_logs` takes a table-level snapshot first (pg_dump) and records it in
  the migrate-all report.
- `waybills.waybill_number`/`waybill_year` are immutable (trigger
  `waybill_identity_immutable`); unique key is
  `(organization_id, waybill_number, COALESCE(waybill_year,0))` — cancelled rows
  keep occupying the key so re-import goes to DUPLICATE.
- Child tables reference parents via composite FKs:
  `(organization_id, waybill_id)` → `waybills(organization_id, id)`; the same
  pattern for payment children.
- Key partial unique indexes (must exist, see `docs/architecture/invariants.md`
  for the full list): one current `waybill_amounts` row per waybill; one active
  PDF per waybill (`matching_status <> 'REPLACED'`); one active driver release
  authorization; one open gateway attempt per waybill; unique gateway reference;
  one ACTIVE gateway per org; one active driver per mobile; one default ACTIVE
  commitment template; unique tracking number per (org, method) for
  CARD_TO_CARD/POS/BANK_TRANSFER; `payments.idempotency_key` unique when present.
- CHECK constraints: full release invariant (release ⇒ payment APPROVED/NOT_REQUIRED
  ∧ commitment ACCEPTED/NOT_REQUIRED ∧ document VERIFIED); cancel-release
  invariant; gateway column pairing + `method='GATEWAY'` ⇒ auto_verified_at set;
  `OPERATOR_CORRECTION` ⇒ reason present; bank_cards card 16 digits / IBAN
  `IR`+24 digits.
- Triggers: `check_refund_ceiling` (with `pg_advisory_xact_lock(waybill_id)`),
  `waybill_identity_immutable`, `commitment_version_immutable`.
- Amounts: BIGINT everywhere. `audit_logs` is append-only (app role has
  INSERT/SELECT only) with row_hash/prev_hash chain + 15-minute off-site anchor.
- Stateful entities carry `version`; updates require
  `WHERE version = :expected` (conflict → 409, never 500).
- An org filter is injected server-side via a Prisma Client Extension —
  forgetting a `where` must not become a cross-org leak.
