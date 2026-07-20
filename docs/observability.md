# Observability and self-monitoring

DevRelay emits one-line structured JSON logs, bounded process metrics, and local OpenTelemetry spans. Correlation IDs connect scheduled checks, policy evaluation, incident reconciliation, outbox publication, and notification delivery without recording request bodies, endpoint URLs, headers, credentials, response bodies, subscriber addresses, or notification payloads.

## Log policy

- `debug`: local diagnosis only; disabled in hosted production by default.
- `info`: normal request, queue, policy, transition, and delivery lifecycle events.
- `warn`: retryable failures, stale evidence, paused scheduling, and growing backlog.
- `error`: exhausted delivery attempts, worker failures, and API server errors.

Hosted logs use the deployment provider's free retention window. Local logs are written to stdout and retained only when the operator redirects or collects them. No application-managed log archive is created, and logs must not be retained beyond 14 days for the MVP demo.

## Metrics

`GET /health/metrics` exposes bounded, process-lifetime counters and p95 summaries for API requests, checks, queue lag, incident deduplication, notification delivery, SSE connections, and polling fallbacks. Metrics contain only low-cardinality operational labels. The endpoint is intended for the free hosted demo and reliability report, not long-term billing or customer analytics.

## Health

`GET /health` checks PostgreSQL, Redis in BullMQ mode, worker heartbeat age, scheduler lag, outbox backlog, and expired check windows. A dependency failure marks health as `degraded`; it does not create an incident or enqueue a notification, which prevents recursive alert storms. An external free uptime monitor may call this endpoint after deployment.

## Tracing

The API and worker configure an in-memory OpenTelemetry provider. Major processing stages use the job correlation ID and safe resource identifiers as span attributes. In-memory export keeps local development and the hosted demo at zero cost; a future collector can replace it without changing application instrumentation.
