# Security and data lifecycle

DevRelay treats tenant boundaries, outbound monitoring, provider callbacks, and public status
projections as security boundaries. This document records the controls implemented by the
MVP and the limits that remain deployment responsibilities.

## Review basis and trust boundaries

The MVP release relies on the repository-wide Phase 12 threat model, security review, and
regression suite completed before deployment. Phase 16 did not replace that review with a new scan;
it verified that the published documentation matches the implemented controls and reran the normal
release gates.

| Boundary                             | Principal risk                                      | Implemented control                                                                                           |
| ------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Public internet → API/status routes  | abuse, enumeration, data disclosure                 | rate budgets, bounded inputs, opaque/sluggified public identities, allowlisted projections                    |
| Browser session → tenant resources   | cross-origin mutation, broken access control        | secure sessions, origin checks, server-resolved membership, centralized roles, tenant predicates              |
| Tenant → shared PostgreSQL           | cross-tenant reads/writes                           | organization ownership on tenant tables, composite relations, service-level scope, negative integration tests |
| Scheduler/queue → workers            | duplicates, replay, reordering, job forgery         | versioned schemas, deterministic identities, signed hosted callbacks, atomic claims, idempotent consumers     |
| Worker → monitored target            | SSRF, DNS rebinding, unbounded response             | public-address allowlist, redirect revalidation, connection pinning, method/port/time/size limits             |
| Private incident → public status     | private notes or identifiers leaking                | separate storage and commands, allowlisted public serialization, public-service eligibility checks            |
| Application → email/webhook provider | secret disclosure, replay, false delivery state     | encryption at rest, timestamped HMAC, callback verification, durable attempts, one-time replay claims         |
| Operator/deployment → runtime        | committed credentials, unsafe rotation, quota spend | environment-only secrets, encrypted provider stores, rotation procedure, hard free-tier caps                  |

Security invariants include: an authenticated user cannot act outside an authorized organization;
public routes cannot return private incident or subscriber data; untrusted outbound input cannot
reach private/non-routable addresses through redirects or rebinding; unsigned or replayed callbacks
cannot repeat a business effect; and queue duplication cannot create a second logical result,
incident, or notification.

## Outbound network policy

HTTP monitor and webhook destinations accept only HTTP or HTTPS on ports 80 and 443. TLS monitors
accept only HTTPS on port 443 and validate the platform trust chain and requested hostname using SNI.
URLs containing
credentials or credential-like query keys are rejected. DevRelay resolves every hostname, rejects
the whole destination when any IPv4 or IPv6 answer is loopback, private, link-local, carrier-grade
NAT, documentation, benchmark, multicast, unspecified, or otherwise non-public, and repeats the
same policy for every redirect. The HTTP connection uses a custom lookup pinned to an address from
the validated set, so a later DNS answer cannot replace the address between validation and connect.
Requests use bounded methods, headers, redirects, timeouts, and response sizes. DNS monitors allow only
A, AAAA, CNAME, MX, and TXT lookups with a platform resolver, a bounded deadline, record/TXT caps, and
exact normalized matching; raw resolver replies are not stored. Response bodies, certificates, and raw
transport errors are not stored.

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
and retention cleanup. The Phase 12 review found and hardened the high-risk application boundaries
before the hosted release; its tests remain part of the 178-check release baseline. Dependency audit
and secret scanning are separate release checks and do not replace that threat-model review.

## Known limitations

- The free hosted tier has no dedicated deny-by-default egress firewall; application SSRF controls
  reduce risk but do not create network isolation.
- Provider backup capabilities are used, but an independent restore-time/recovery-point exercise is
  not claimed for the MVP demo.
- Self-service tenant export and audited purge are not implemented; verified operator handling is
  required for deletion requests.
- Controlled hosted email testing is not sufficient for a representative deliverability or latency
  benchmark.
- Secrets must be rotated through provider and deployment stores; they must never be placed in logs,
  screenshots, tickets, public incident updates, or repository files.
