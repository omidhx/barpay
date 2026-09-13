# AGENTS.md — tests/

> Auto-loaded when the agent works under `tests/`. Inherits the root [AGENTS.md](../AGENTS.md).

## Read first

- [docs/quality/testing-strategy.md](../docs/quality/testing-strategy.md) — full strategy (layers, gates, what must be covered)
- [docs/product/acceptance-criteria.md](../docs/product/acceptance-criteria.md) — the 47 MVP acceptance criteria

## Rules

- `fixtures/` contains synthetic data ONLY — real customer data never enters this repo
  (master spec §13.5: privacy is not a substitute for data protection).
- Integration tests run on real PostgreSQL (Testcontainers). SQLite/mocks are forbidden
  for anything touching partial indexes, triggers or `ON CONFLICT`.
- The two rounding examples (80,686,445 → 80,700,000 and 13,712,500 → 13,750,000) are
  permanent golden tests — never delete or loosen them.
- The concurrent-review race test (two reviewers → first wins, second gets
  `409 PAYMENT_STATE_CONFLICT`, never 500, never silent success) is mandatory.
- E2E (Playwright) covers the critical driver journey only — keep it fast and stable.
- Never disable or skip a test to make CI green. A red test is information, not an obstacle.
- Naming: `*.test.ts` for unit/integration, `*.spec.ts` for e2e.
