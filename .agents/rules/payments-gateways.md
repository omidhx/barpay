---
globs: src/modules/payments/**, src/modules/payments/gateways/**
description: Payment & gateway adapter rules (server-side verify, idempotency, UNKNOWN)
---

# Payments / Gateway Rules

- PaymentProvider interface (initiatePayment / verifyTransaction /
  inquiryTransaction) — adapters are stateless; ALL state lives in
  `gateway_transactions`; raw payloads (init/callback/verify) are persisted.
- Adapters live in `src/modules/payments/gateways/adapters/{provider}.ts` +
  registry `adapters/index.ts`. Providers: SEP, BPM, PASARGAD, SADAD (direct) +
  ZARINPAL, ZIBAL (aggregator).
- Adapter I/O is always Rial. Zarinpal: send rial÷10 (toman), verify ×10 —
  conversion ONLY inside that adapter. Zarinpal/Zibal code 101 ("already
  verified") = idempotent success, never an error or second financial effect.
- Melat (BPM) is SOAP and TWO-PHASE: bpVerifyRequest then bpSettleRequest;
  verify-ok + settle-fail → bpReversalRequest. Final validity = settle result.
- Transport: timeout ≤10s; one retry only for init; verify is never retried —
  definite result or UNKNOWN.
- Only ONE open attempt per waybill (INITIATED/RETURNED/UNKNOWN — unique index).
- Callback endpoint is public, finds the attempt via `state`/provider_reference,
  stores raw payload, then ALWAYS calls verifyTransaction server-to-server.
  Duplicate callback on VERIFIED → success no-op; fake state →
  `GATEWAY_CALLBACK_INVALID` + security event; duplicate reference →
  `GATEWAY_REFERENCE_DUPLICATE`.
- Amount snapshot: `gateway_transactions.amount` + `waybill_amount_id` at init.
  If `waybills.current_amount_id` changed mid-attempt → CANCELLED with
  `AMOUNT_CHANGED`.
- UNKNOWN: inquiry job every 10 min up to 24h (FOUND_VERIFIED / FOUND_FAILED /
  STILL_UNKNOWN → supervisor alert); driver sees "در حال بررسی" and the
  repay button stays locked. Expire open attempts after 20 min.
- On successful verify: create payments row (method=GATEWAY, status=APPROVED,
  auto_verified_at) + gateway_transactions → VERIFIED + audit PAYMENT_VERIFIED
  + SMS/notifications — all in ONE DB transaction.
- Credentials encrypted AES-256-GCM (key from env) in
  `payment_gateways.credentials_json`; never logged or returned by API.
  Returned PANs masked (`6104-****-****-1234`).
- Manual payments are claims, never auto-approved (only gateway auto-verifies).
  Card-to-card requires `payout_card_id`. Guard rails: `OVERPAYMENT_REQUIRES_DISCREPANCY`,
  `AMOUNT_CHANGED`, `PAYMENT_TRACKING_DUPLICATE`, `COMMITMENT_NOT_ACCEPTED`.
- Residual (remainder) payments: `is_residual=true`, `parent_payment_id`,
  amount = corrected − approved sum, NEVER re-rounded, no re-signature.
- Refunds: manual record (RECORDED) + supervisor approval (REFUND_SETTLED);
  maker ≠ checker; ceiling enforced by DB trigger.
