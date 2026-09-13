# AGENTS.md — workers/ (queue jobs)

> Auto-loaded when the agent works under `workers/`. Inherits the root [AGENTS.md](../AGENTS.md).

## Read first

- [docs/architecture/overview.md](../docs/architecture/overview.md) — web vs worker split, deployment topology
- [docs/integrations/sms-providers.md](../docs/integrations/sms-providers.md) — SMS queue, circuit breaker, 30s SLA
- [docs/integrations/payment-gateways.md](../docs/integrations/payment-gateways.md) — UNKNOWN inquiry job (every 10 min, up to 24 h)

## Rules

- The queue (graphile-worker on PostgreSQL) is ONLY for: SMS sending, file processing,
  reports, cleanup, gateway UNKNOWN inquiry and scheduling.
- Money and delivery state transitions NEVER go through the queue — they are transactional
  in the request itself ([docs/architecture/invariants.md](../docs/architecture/invariants.md)).
- Every job is idempotent (safe to re-run), carries `organization_id` + entity ids, and
  retries with exponential backoff and a bounded attempt count.
- Worker and web share one Docker image but run as separate services; worker
  restart/deploys must not corrupt in-flight jobs (graceful shutdown, job locking).
- No secrets, PANs, or unmasked driver mobiles in job logs.
