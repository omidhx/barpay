---
globs: src/**/*.tsx, src/**/*.ts, src/app/**/*.css
description: RTL-first Persian frontend rules (driver portal + admin panel)
---

# Frontend / RTL Rules

- Every page/component is RTL-first: `dir="rtl"`, Vazirmatn font, Persian
  thousand separators for amounts, Jalali dates for display (UTC stored).
- Driver portal is mobile-first: touch targets ≥48px (≥56px for pay /
  sign-commitment / download buttons), text contrast ≥4.5:1 (7:1 for sensitive
  text — WCAG AAA for sunlight readability), short direct Persian copy, no
  jargon, support phone always visible at the bottom.
- Driver flow pages: `/d/[token]/{page, verify, waybill, commitment, payment,
  payment/status, done}`. The CURRENT step is derived from server state
  (`lib/waybills/phase.ts`) — never from local state. Store payment form draft
  in localStorage; lock buttons after submit.
- Numeric inputs (search, OTP, manual amount) must pass `normalizeDigits`.
- Copy buttons (card number / account / IBAN) copy the NORMALIZED value (no
  spaces/separators) via Clipboard API and show a "کپی شد" confirmation.
- Card display component: bank icon from `public/banks/{bank_code}.svg`,
  Persian bank name from the fixed in-code bank table, holder name, card number
  4-4-4-4, account number, IBAN grouped — shared component between admin
  preview and driver portal (what the manager sees = what the driver sees).
- Server Components for lists/details; Client Components + RHF + shared Zod
  schema for forms; Server Actions only for non-financial forms; financial
  mutations = Route Handlers with `Idempotency-Key` header.
- Live queues poll every 30s (no WebSocket in MVP). Tables: server-side
  pagination, sortable columns, filters in URL.
- Standard response envelope `{ok, data, error:{code, humanMessage,
  retryable, correlationId}}`; error code from `src/lib/errors/catalog.ts`;
  the frontend never shows raw technical errors.
- Confirm dialogs for sensitive actions (send amount, cancel, refund approve)
  with a summary of the affected record in the dialog.
