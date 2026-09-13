# AGENTS.md — src/ (application code)

> This file is auto-loaded by coding agents (Antigravity, Codex, Gemini CLI, ...) whenever
> they work under `src/`. It inherits every rule from the root [AGENTS.md](../AGENTS.md) —
> read that first if you have not.

## Read before writing code

Implementation input (in this order — the four executable files):

1. [docs/product/business-rules.md](../docs/product/business-rules.md) — executable business rules
2. [docs/architecture/data-model.md](../docs/architecture/data-model.md) — executable data model
3. [docs/architecture/state-transitions.md](../docs/architecture/state-transitions.md) — executable state machine
4. [docs/architecture/invariants.md](../docs/architecture/invariants.md) — invariants + physical constraints

Task-specific references:

- UI work → [docs/frontend/ui-ux-rtl-guidelines.md](../docs/frontend/ui-ux-rtl-guidelines.md)
- API routes → [docs/architecture/api-contracts.md](../docs/architecture/api-contracts.md)
- Gateway/payment code → [docs/integrations/payment-gateways.md](../docs/integrations/payment-gateways.md) (+ master-spec Appendix ج)
- SMS/notifications → [docs/integrations/sms-providers.md](../docs/integrations/sms-providers.md)
- Security review → [docs/security/threat-model.md](../docs/security/threat-model.md)

## Structure (master spec §13.1 — keep exactly)

```text
src/
├── app/
│   ├── (auth)/                  panel login
│   ├── (panel)/                 dashboard/ waybills/ imports/ payments/ settings/
│   └── driver/                  public driver portal (d/[token]/... pages)
├── modules/                     modular-monolith boundaries
│   ├── auth/ imports/ waybills/ documents/ commitments/
│   ├── payments/                payments/gateways/adapters/{sep,bpm,pasargad,sadad,zarinpal,zibal}.ts
│   ├── delivery/ notifications/ reports/ audit/
├── components/                  shared UI (shadcn/ui, RTL-configured)
└── lib/
    ├── auth/ db/ storage/ permissions/ crypto/ audit/
    ├── waybills/phase.ts        THE single derived-phase function
    └── errors/catalog.ts        single error catalog (code + Persian message + action hint)
```

## Hard rules for this directory

- TypeScript strict mode; `any` is banned; `npm run lint && npm run typecheck` must pass.
- A module never imports another module's internals — only its public `index.ts`.
  Enforced by dependency-cruiser in CI.
- Server Components by default; add `'use client'` only for real interactivity
  (forms, copy-to-clipboard buttons, signature pad).
- Amounts: `bigint` Rials everywhere in TS/Zod; serialize as string in JSON.
- Validate every external input with Zod (route handlers, server actions, Excel rows, env).
- All user-facing strings are Persian via the dictionary; UI is RTL-first using logical
  CSS properties; numeric inputs pass through `normalizeDigits` (Persian/Arabic → Latin).
- Permissions are checked server-side in every handler — a hidden button is not access control.
- `organization_id` always comes from the server session, never from request input.
- Gateway results are valid ONLY from server-to-server verify; callback params are for
  UI routing only. Toman conversion exists only inside the Zarinpal adapter.
- New dependency → stated reason in the PR. Only two feature flags exist:
  `COMMITMENT_ENFORCEMENT` (OFF/SHADOW/ENFORCED) and `SIGNED_URL_DOWNLOAD` — both documented,
  both temporary.
