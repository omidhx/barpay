# AGENTS.md — docs/ (documentation)

> Auto-loaded when the agent works under `docs/`. Inherits the root [AGENTS.md](../AGENTS.md).

## The hierarchy (master spec §13.2)

1. The four executable files are the ONLY implementation input:
   [product/business-rules.md](product/business-rules.md) ·
   [architecture/data-model.md](architecture/data-model.md) ·
   [architecture/state-transitions.md](architecture/state-transitions.md) ·
   [architecture/invariants.md](architecture/invariants.md).
2. [master-spec/barnameh-pay-master-doc-2.5.md](master-spec/barnameh-pay-master-doc-2.5.md)
   is the policy & decision source (Persian, ~3700 lines) — NOT daily coding input.
3. Everything else here is reference material.

On conflict: the four files win → open an issue → fix the master spec. Do not improvise.

## Editing rules

- Documentation language is Persian; file/folder names and code identifiers are English.
- A policy change = edit the master spec AND sync the matching executable file in the
  same PR. A stale doc is treated like broken code in CI (markdownlint + consistency
  check — master spec §13.7).
- Before proposing a "new idea", check [master-spec/README.md](master-spec/README.md) —
  Appendix ب lists rejected decisions; don't reopen them without new evidence.
- Every document ends with a «مستندات مرتبط» (related-docs) footer of real relative
  links. When you add a new file: register it in the root AGENTS.md doc map, and link it
  from its sibling documents.
- Relative links only (`../product/...`); never absolute repo URLs.

## Folder map

- `product/` — scope, business rules, acceptance criteria
- `architecture/` — overview, data model, state machine, invariants, API contracts
- `integrations/` — payment gateways, SMS providers
- `security/` — threat model
- `frontend/` — UI/UX & RTL guidelines
- `quality/` — testing strategy
- `runbooks/` — deploy, backup-restore, rollback, onboarding, incidents
- `master-spec/` — the v2.5 master specification + its [README](master-spec/README.md)
