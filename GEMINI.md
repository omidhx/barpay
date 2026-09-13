# GEMINI.md

This project uses **AGENTS.md** as the single source of truth for agent instructions.

Read `AGENTS.md` first — it contains the project identity, doc precedence rules,
non-negotiable rules (money as bigint Rials, commitment-before-payment, server-side
gateway verify, RTL Persian UI), commands, structure, git workflow, and testing
expectations.

Key reference docs (Persian):
- [business-rules.md](docs/product/business-rules.md) — executable business rules
- [data-model.md](docs/architecture/data-model.md) — executable data model
- [state-transitions.md](docs/architecture/state-transitions.md) — executable state machine
- [invariants.md](docs/architecture/invariants.md) — invariants + physical DB constraints
- [barnameh-pay-master-doc-2.5.md](docs/master-spec/barnameh-pay-master-doc-2.5.md) — master specification (policy source)

Nested agent files (loaded contextually per directory):
[src](src/AGENTS.md) · [prisma](prisma/AGENTS.md) · [tests](tests/AGENTS.md) ·
[workers](workers/AGENTS.md) · [docs](docs/AGENTS.md).

Note for Google Antigravity: workspace rules live in `.agents/rules/` (glob-scoped).
