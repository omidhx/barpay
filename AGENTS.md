# AGENTS.md — barnameh-pay

> This file is the primary instruction file for AI coding agents (Google Antigravity, Cursor,
> OpenAI Codex, Gemini CLI, Claude Code, ...). It is read automatically at the repo root.
> Farsi speakers: the quick explanation of this kit is in `README.md`; the deep policy source
> is `docs/master-spec/barnameh-pay-master-doc-2.5.md` (Persian, ~3700 lines, v2.5).

## Project Identity

**barnameh-pay (بارنامه‌پی)** — Waybill (بارنامه) management + driver payment system for Iranian
logistics companies. Persian-first, fully RTL product. ~200 waybills/day, ~50 concurrent driver
sessions. Money flows driver → company only. Drivers authenticate via SMS OTP through
short-lived links — no permanent accounts, no app install.

Tech stack (locked): **Next.js 15 (App Router) + TypeScript + PostgreSQL 16 + Prisma 6 +
Zod + React Hook Form + Tailwind CSS + shadcn/ui (RTL) + Vitest + Playwright + graphile-worker
(Postgres queue) + Docker Compose. Node.js 22 LTS. Modular monolith — no microservices.**

## Doc Map & Precedence (IMPORTANT)

Order of authority when documents disagree:

1. **The four executable files** (these are the ONLY implementation input):
   - [business-rules.md](docs/product/business-rules.md) — 18 business answers + 3 v2.5 decisions
   - [data-model.md](docs/architecture/data-model.md) — tables, constraints, indexes
   - [state-transitions.md](docs/architecture/state-transitions.md) — 5 status axes + derived phase
   - [invariants.md](docs/architecture/invariants.md) — cross-axis invariants + physical DB constraints
2. [master-spec/barnameh-pay-master-doc-2.5.md](docs/master-spec/barnameh-pay-master-doc-2.5.md) — policy & decision source (Persian)
3. `docs/` reference files: [overview](docs/architecture/overview.md) · [api-contracts](docs/architecture/api-contracts.md) · [payment-gateways](docs/integrations/payment-gateways.md) · [sms-providers](docs/integrations/sms-providers.md) · [threat-model](docs/security/threat-model.md) · [ui-ux-rtl-guidelines](docs/frontend/ui-ux-rtl-guidelines.md) · [testing-strategy](docs/quality/testing-strategy.md) · [runbooks](docs/runbooks/deploy.md)

If you find a conflict: the four executable files win; open an issue and do NOT improvise.

## Nested Agent Files & Workspace Rules

`AGENTS.md` is hierarchical: the root file (this one) is loaded in **every** session; a
nested `AGENTS.md` is loaded when the agent works inside that directory:

- [src/AGENTS.md](src/AGENTS.md) — application code rules (structure, TS, RTL, module boundaries)
- [prisma/AGENTS.md](prisma/AGENTS.md) — schema & migration rules
- [tests/AGENTS.md](tests/AGENTS.md) — test rules
- [workers/AGENTS.md](workers/AGENTS.md) — queue/worker rules
- [docs/AGENTS.md](docs/AGENTS.md) — documentation rules

Antigravity workspace rules (glob-scoped, auto-activated per file type):
`.agents/rules/{core,frontend-rtl,payments-gateways,database,testing}.md`.
First Agent-Manager message: [prompts/00-kickoff-antigravity.md](prompts/00-kickoff-antigravity.md).
Phase checklist: [TODO.md](TODO.md).

## Commands

```bash
npm run dev                 # local dev (needs Postgres via docker-compose up -d db)
npm run build               # production build
npm run lint && npm run typecheck
npm run test                # Vitest unit
npm run test:integration    # Vitest + real PostgreSQL (Testcontainers) — NEVER SQLite/mock for these
npm run test:e2e            # Playwright (critical flows only)
npx prisma migrate dev      # migrations (forward-only, versioned)
npx prisma migrate diff     # drift check between schema.prisma and DB — runs in CI
docker compose up -d        # db + minio (local)
docker compose -f docker-compose.prod.yml up -d   # web + worker + nginx
```

## Non-Negotiable Rules (violating any of these = broken build)

**Money**
- Amounts are **BIGINT Rials**, integer only — never `float`/`double`, never JS `number`
  (use `bigint` in TS/Zod; serialize as string across JSON).
- Currency is **Rial, fixed** everywhere. The ONLY place Toman conversion exists is inside
  the Zarinpal adapter (send: rial ÷ 10; verify: toman × 10). No other code may convert.
- Payable amount is produced ONLY by the chain: raw Excel `جمع پرداختی راننده` →
  ceil-round to org multiple (default 50,000 IRR) → optional surcharge (default 700,000 IRR)
  → stored in `waybill_amounts`. Golden tests: 80,686,445 → 80,700,000 and
  13,712,500 → 13,750,000. Residual (remainder) is NEVER re-rounded.

**Process order (v2.5 decision — do NOT flip)**
- Driver chain: view info → **read & sign commitment FIRST** → pay (gateway or card-to-card)
  → download PDF. Payment endpoints MUST reject with `COMMITMENT_NOT_ACCEPTED` in ENFORCED
  mode when commitment_status ≠ ACCEPTED.
- Payment gateway integration IS MVP scope (6 providers behind one `PaymentProvider`
  adapter: SEP, BPM, PASARGAD, SADAD direct + ZARINPAL, ZIBAL aggregator).
- Gateway result is valid ONLY from server-to-server verify. NEVER trust callback params
  (they are for UI routing only). Compare verify amount (Rial) with the recorded attempt
  amount — mismatch = `GATEWAY_AMOUNT_MISMATCH` + FAILED.
- `UNKNOWN` attempts are NEVER assumed failed: inquiry job every 10 min up to 24 h.

**State & data**
- 5 independent status axes on `waybills` (shipment/document/payment/commitment/release).
  NEVER merge them into one status field. Transitions ONLY via the central state-machine
  service, with previous-status condition + `version` optimistic lock, inside a DB
  transaction, logged to `audit_logs`.
- `audit_logs` is append-only (INSERT/SELECT only for the app role); each row carries
  `row_hash`/`prev_hash`.
- DB changes ONLY via versioned forward-only Prisma migrations. Partial indexes, CHECK
  constraints, generated columns, triggers live in raw SQL migration files (Prisma schema
  cannot express them) — CI fails on drift.
- `organization_id` always comes from the server session, never from client input. Every
  org-scoped query filters on it (service layer + Prisma client extension).
- Money/delivery state transitions never go through the queue — they are transactional in
  the request. Queue (graphile-worker) is for SMS, file processing, reports, cleanup.

**Security**
- Permissions are checked server-side on EVERY sensitive endpoint. Hiding a button is not
  access control.
- PDFs live in private storage, served only through the guarded download endpoint where
  `canRelease(waybillId, sessionId)` runs in every request. No permanent public links.
- Gateway credentials: AES-256-GCM encrypted at rest (`credentials_json`), key from env
  var. Never logged, never returned by API. Returned PANs are masked.
- OTP: 6 digits, TTL 3 min, max 5 attempts, lock 15 min, 3 sends/10 min, HMAC-SHA256
  hashed (never raw), constant-time compare.
- Secrets, tokens, OTP codes, PANs, driver mobiles (masked `0912***1234` in logs) are
  never written to logs or error messages.
- Driver-facing errors are short Persian messages + support phone; never stack traces.

**Language & UI**
- Code, identifiers, commits, and technical docs: English. ALL user-facing strings:
  Persian. Entire UI is **RTL-first** (`dir="rtl"`), Vazirmatn font, Persian digits for
  display; inputs normalize Persian/Arabic digits to Latin via one `normalizeDigits` util.
- Driver portal: mobile-first, huge buttons (≥48px touch, ≥56px for pay/sign/download),
  contrast ≥ 4.5:1, no jargon. Card numbers display 4-4-4-4 with copy buttons (copy
  normalized value).

## Project Structure

```text
AGENTS.md               ← THIS file — auto-read at the start of every session (repo root)
GEMINI.md / CLAUDE.md   ← compatibility pointers to this file (Gemini CLI / Claude Code)
README.md / TODO.md / .env.example / .gitignore
.agents/rules/          ← Antigravity workspace rules (glob-scoped)
prompts/                ← 00-kickoff-antigravity.md (first Agent-Manager message)
docs/                   ← the Doc Map above; doc-editing rules in docs/AGENTS.md
src/                    ← app/ (auth)|(panel)|driver · modules/ (10 domains) · components/ · lib/
                          modules/payments/gateways/adapters/{sep,bpm,pasargad,sadad,zarinpal,zibal}.ts
                          lib/waybills/phase.ts = THE single derived-phase function
                          lib/errors/catalog.ts = single error catalog (code + Persian message + hint)
prisma/                 ← schema.prisma + migrations/ (raw SQL for physical constraints)
workers/                ← graphile-worker (same Docker image as web, separate service)
tests/                  ← unit/ integration/ e2e/ fixtures/ (synthetic data only)
scripts/ · .github/workflows/ · Dockerfile · docker-compose.yml (Phase 2)
```

Module boundaries are enforced: a module never imports another module's internals
(dependency-cruiser in CI).

## Git Workflow

- `main` always releasable; short-lived branches `feat/...` `fix/...` `chore/...` `test/...` `docs/...`
- Conventional commits: `feat(payments): prevent concurrent double approval`
- Merge only with green CI (lint, typecheck, unit, integration on real Postgres, drift check).
- NEVER commit: `.env`, real customer files/PDFs/signatures, DB backups, logs with PII,
  gateway credentials or encryption keys.

## Testing Expectations

- New financial/delivery logic ships WITH tests; two official rounding examples are
  permanent golden tests.
- Integration tests run on real PostgreSQL (partial indexes, triggers, `ON CONFLICT`
  do not work on SQLite/mocks).
- Concurrent-review test is mandatory: two reviewers race → first wins, second gets
  `409 PAYMENT_STATE_CONFLICT`, never 500, never silent success.
- Disabling tests to make CI green is forbidden. Adding a dependency needs a stated reason.

## How You Should Work Here (vibe-coding discipline)

- Implement per **feature card**: goal, inputs/outputs, required permission, data-model
  change, success path, error path, abuse cases, expected tests, what must NOT change.
  Never take "build the whole payment system" as one task.
- No broad rewrites outside the task scope. No speculative features from the
  non-goals list (v2.5 ch. 2.2: no accounting, no OCR, no POS, no native app, ...).
- When a doc rule seems wrong, STOP and ask — do not silently deviate.
- Human review is mandatory for: financial logic, auth, migrations, file access.
