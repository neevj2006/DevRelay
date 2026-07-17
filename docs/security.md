# Security and data lifecycle

DevRelay treats tenant boundaries, outbound monitoring, provider callbacks, and public status
projections as security boundaries. This document records the controls implemented by the
portfolio MVP and the limits that remain deployment responsibilities.

## Outbound network policy

Monitor and webhook destinations accept only HTTP or HTTPS on ports 80 and 443. URLs containing
credentials or credential-like query keys are rejected. DevRelay resolves every hostname, rejects
the whole destination when any IPv4 or IPv6 answer is loopback, private, link-local, carrier-grade
NAT, documentation, benchmark, multicast, unspecified, or otherwise non-public, and repeats the
same policy for every redirect. The HTTP connection uses a custom lookup pinned to an address from
the validated set, so a later DNS answer cannot replace the address between validation and connect.
Requests use bounded methods, headers, redirects, timeouts, and response sizes. Response bodies and
raw transport errors are not stored.

The hosted free tier does not provide a dedicated egress firewall. Application-layer address
validation is therefore backed by tests but is not equivalent to network isolation. Production
deployments should add deny-by-default worker egress controls and explicitly allow public HTTP and
HTTPS when the hosting platform supports them.

## Browser and API controls

- Authenticated cookie mutations require the configured application origin.
- CORS allows only the configured application origin and credentials.
- Mutation bodies use explicit JSON content types; authentication bodies are independently bounded.
- API and web responses set content-type, framing, referrer, permissions, opener, HSTS, and content
  security headers.
- Better Auth uses secure cookies in production, database-backed rate limits, and encrypted OAuth
  tokens.
- Public subscriptions use socket-derived client identity unless a deployment configures explicit
  trusted proxy CIDRs. Public status reads and live streams have source and global budgets.

## Secrets, callbacks, and rotation

Secrets are supplied through deployment environment variables and are never committed. Production
startup requires authentication and notification encryption keys. Webhook signing secrets and
verification URLs are encrypted at rest. OAuth access, refresh, and ID tokens use Better Auth's
encrypted-token storage. QStash and email-provider callbacks are verified against their raw bodies;
accepted callback identities are claimed atomically so replays are acknowledged without repeating
work. Provider complaint suppression and its replay marker commit in one transaction.

Rotate a compromised credential by replacing it in the deployment secret store, redeploying every
consumer, revoking the old provider credential, and verifying a signed test delivery. Webhook
destinations must be rotated from the owner/admin interface so the new encrypted secret and audit
event are created together. Never paste credentials into tickets, logs, screenshots, or status
updates.

## Public/private projection

Public status queries use allowlisted fields. An automatic incident is public only when it affects a
service that is both public and attached to that status page. Private incident titles, notes,
identifiers, raw evidence, subscriber addresses, and secrets are excluded. Live-version polling uses
the same public eligibility rules, so private tenant activity does not produce public change signals.

## Retention and data management

The worker and hosted dispatcher run idempotent daily cleanup. Defaults retain raw check results and
delivery attempts for 30 days and expired or terminal subscriber tokens for 7 days after expiry.
Completed outbox events follow the delivery-attempt window. Every cleanup run records its tenant,
cutoff, outcome, and deleted count. Operators can shorten these bounded settings through environment
configuration.

Organization deletion is a deliberate owner operation: revoke sessions/API keys and provider
credentials, export tenant-owned services, incidents, public updates, audit history, subscribers, and
delivery metadata, then soft-delete the organization before a separately audited purge. The MVP does
not expose that destructive workflow yet. Until it does, export/deletion requests require an operator
runbook and identity verification; direct ad-hoc database deletion is not a supported product path.

## Verification

Security regression coverage includes IPv4 and IPv6 ranges, alternate IP forms, mixed DNS answers,
redirect revalidation, connection-address pinning, cross-origin mutations, trusted client identity,
public/private incident projection, callback replay, token URL handling, cross-tenant authorization,
and retention cleanup. Dependency audit and secret scanning are part of the CI/release checklist.
