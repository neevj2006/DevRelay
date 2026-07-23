# Protocol monitoring threat model

TLS and DNS monitors extend DevRelay's existing outbound-monitoring trust boundary. PostgreSQL remains the source of truth; queued work is untrusted and may be duplicated, delayed, or replayed. A check result stores only a protocol, bounded duration, safe result code, region, and protocol-specific summary.

| Threat                          | Boundary                  | Mitigation                                                                                                              |
| ------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| SSRF or DNS rebinding           | worker to HTTP/TLS target | validate public DNS answers, reject unsafe ranges, and pin the checked connection to a validated address                |
| Certificate impersonation       | worker to TLS target      | HTTPS/443 only, SNI, platform trust-chain verification, hostname validation, and TLS 1.2/1.3                            |
| Resolver abuse or amplification | worker to DNS resolver    | supported A/AAAA/CNAME/MX/TXT types only, platform resolver, deadline, record-count and TXT-size caps                   |
| Sensitive protocol disclosure   | database/API/browser      | retain no certificate blobs, raw resolver replies, raw transport errors, request secrets, or response bodies            |
| False healthy result            | executor to policy engine | NXDOMAIN, no-data, timeout, SERVFAIL, malformed replies, unexpected records, and TLS errors are failures, never success |
| Duplicate delivery              | queue to worker           | deterministic expected windows, unique check results, atomic claims, and the existing idempotent policy/outbox paths    |

The free hosted environment still lacks a dedicated egress firewall. These controls reduce application-level risk but do not replace deny-by-default network isolation. DNSSEC, custom resolvers, authoritative DNS checks, TCP, domain-expiry, and browser-synthetic monitoring are intentionally deferred.
