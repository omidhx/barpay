---
globs: tests/**, src/**/*.test.ts, src/**/*.spec.ts, .github/workflows/*
description: Testing rules (real Postgres, golden cases, concurrency, access matrix)
---

# Testing Rules

- Unit (Vitest), integration (Vitest + REAL PostgreSQL via Testcontainers/CI
  service — never SQLite/mocks for anything touching indexes, triggers,
  generated columns, or `ON CONFLICT`), E2E (Playwright, critical flows only),
  property-based (fast-check).
- Financial & delivery logic ships WITH tests. Never skip/disable a test to
  make CI green; adding a dependency requires a stated reason.
- Permanent golden tests: rounding examples 80,686,445 → 80,700,000 and
  13,712,500 → 13,750,000 (plus surcharge). Property tests: rounding output is
  always a multiple of the unit and ≥ input; residual ≥ 0; derived phase always
  valid or NEEDS_ATTENTION.
- `parseWaybillDate` table-driven tests: valid/invalid Excel serials, Jalali
  strings with `.` and `/`, Persian digits, year boundary 1403/12/30 vs
  1404/01/01, leap year; raw 1405 must yield INVALID_DATE_FORMAT.
- Commitment template rendering: unresolved variable = error; byte-identical
  golden output for every ACTIVE template.
- Gateway adapters: mock HTTP with official sample responses from
  `tests/fixtures/gateways/`; cover init/verify/inquiry, error-code mapping,
  Rial↔Toman conversion, code 101 idempotent success, amount mismatch,
  duplicate/fake callback, two concurrent inits (one wins), UNKNOWN → inquiry,
  20-minute expiry, AMOUNT_CHANGED mid-attempt.
- Mandatory concurrency tests (deterministic, injected delays): two reviewers
  on one payment — first wins, second gets `409 PAYMENT_STATE_CONFLICT`;
  simultaneous refunds on one waybill (trigger + advisory lock); idempotency
  races (same key, same/different body).
- Chaos tests: kill worker mid-SMS-send (job resumable, no duplicate send);
  drop DB connection mid-commit of amount correction (full rollback, idempotent
  re-run).
- Access matrix test (table-driven, generated from the endpoint catalog): every
  route × role (OWNER/MANAGER/SUPERVISOR/OPERATOR ± permission, TECH_ADMIN,
  driver ± session, anonymous) → expected 200/401/403. A new endpoint without a
  matrix row breaks CI.
- Load: k6 on driver-portal APIs at 3× peak (150 sessions / 600 waybills per
  day) on staging — only gradual slowdown allowed; 50 concurrent browser
  sessions via Playwright.
- Fixtures are synthetic — never real customer data (barcodes, PDFs,
  signatures, receipts) inside the repo.
