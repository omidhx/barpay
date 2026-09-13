---
alwaysApply: true
description: Core non-negotiable rules for barnameh-pay (money, order, security, language)
---

# Core Rules (Always On)

- Money is **BIGINT Rials**, integer only. Never `float`/`double`, never JS `number`
  (use `bigint` in TS/Zod, serialize as string in JSON). Currency is fixed Rial.
  The ONLY Toman↔Rial conversion lives inside the Zarinpal adapter (÷10 send, ×10 verify).
- Payable amount comes ONLY from `waybill_amounts` (chain: raw Excel value →
  ceil-round to org multiple, default 50,000 → optional surcharge, default 700,000).
  Golden tests: 80,686,445 → 80,700,000 and 13,712,500 → 13,750,000.
- Driver chain order (v2.5): view info → **sign commitment FIRST** → pay → download.
  Payment endpoints reject with `COMMITMENT_NOT_ACCEPTED` when ENFORCED and
  commitment_status ≠ ACCEPTED. Never request re-signature for residual payments.
- Gateway result is valid ONLY from server-to-server verify. Never trust callback
  params. Compare verify amount (Rial) with attempt amount — mismatch = FAILED
  (`GATEWAY_AMOUNT_MISMATCH`). UNKNOWN attempts are never assumed failed.
- 5 independent status axes on `waybills` — never merge into one field. Transitions
  only via the central state-machine service, in a transaction, with
  previous-status condition + `version`, logged to `audit_logs`.
- `organization_id` comes from the server session only — never from client input.
- Permissions are checked server-side on every sensitive endpoint. Hiding a button
  is not access control.
- Files are private; PDF download only through the endpoint where `canRelease`
  runs in every request (atomic grant). No public permanent links.
- Secrets, tokens, OTP codes, PANs, full card numbers, and unmasked driver
  mobiles never appear in logs, error messages, or API responses.
- DB changes only via versioned forward-only Prisma migrations; physical
  constraints (partial indexes, CHECKs, triggers, generated columns) live in raw
  SQL migration files; CI fails on schema drift.
- Financial state transitions never go through the queue — they are
  transactional in the request. Queue is for SMS/files/reports/inquiry only.
- All user-facing strings are Persian; entire UI is RTL-first (`dir="rtl"`,
  Vazirmatn font). Code, identifiers, and commits are English. Numeric inputs pass
  through `normalizeDigits` (Persian/Arabic digits → Latin).
- Driver-facing errors: short Persian message + support phone + tracking code.
  Never stack traces.
- Never disable tests to make CI green. Never commit `.env`, customer data,
  real PDFs/signatures, or backups.
- Docs precedence: the four executable files
  (`docs/product/business-rules.md`, `docs/architecture/data-model.md`,
  `state-transitions.md`, `invariants.md`) override the master spec; on conflict,
  stop and raise an issue instead of improvising.
