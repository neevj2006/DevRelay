# DevRelay

DevRelay is a multi-tenant monitoring and incident-response SaaS that turns scheduled HTTP, TLS, and DNS checks into confirmed service state, exactly one incident, public status updates, and retry-safe subscriber notifications. It is built as a TypeScript modular monolith with PostgreSQL as the source of truth, interchangeable BullMQ and QStash queue adapters, a transactional outbox, tenant-scoped authorization, and explicit defenses for outbound-request and public/private data boundaries.

[Open the live demo](https://devrelay-delta.vercel.app) · [View the public status page](https://devrelay-delta.vercel.app/status/acme) · [Read the architecture guide](docs/architecture.md)

The hosted demo uses deterministic, non-personal data. Its public status page needs no account. Administrative product routes require authentication and are intentionally not exposed through shared demo credentials.

## Core workflow

```mermaid
flowchart LR
  A["Schedule due HTTP, TLS, or DNS check"] --> B["Validate protocol-specific target"]
  B --> C["Persist one check result per monitor window"]
  C --> D{"Policy threshold reached?"}
  D -- "No" --> E["Keep current evidence-backed state"]
  D -- "Failure" --> F["Create or link one active incident"]
  D -- "Recovery" --> G["Resolve state after recovery confirmation"]
  F --> H["Write public update and outbox event atomically"]
  H --> I["Fan out idempotent email/webhook deliveries"]
  I --> J["Publish status through SSE with polling fallback"]
```

Duplicate jobs, retries, and concurrent workers converge through database uniqueness constraints and transactional claims. If checks stop arriving, DevRelay reports `Unknown`; it never invents a healthy state from stale evidence.

## Architecture

```mermaid
flowchart TB
  Browser["Next.js web application"] --> API["NestJS API"]
  Public["Public status clients"] --> API
  API --> DB[("PostgreSQL source of truth")]
  API --> Queue{"JobQueue adapter"}
  Queue --> Bull["BullMQ + Redis\nlocal persistent workers"]
  Queue --> QStash["QStash\nhosted signed callbacks"]
  Bull --> Worker["Execution services"]
  QStash --> API
  Worker --> DB
  API --> Providers["Resend and signed webhooks"]
  API --> SSE["SSE with polling fallback"]
```

The repository is a pnpm/Turborepo workspace:

```text
apps/
  api/          NestJS API, public endpoints, and hosted job receivers
  web/          Next.js App Router application
  worker/       Persistent BullMQ workers for local/full-reliability mode
packages/
  config/       Validated environment contracts
  contracts/    Shared HTTP, queue, and webhook contracts
  database/     Drizzle schema, migrations, and transaction helpers
  execution/    Scheduler, checks, policy, incidents, outbox, and delivery
  monitoring/   Outbound HTTP, TLS, DNS safety and monitoring domain
  queue/        JobQueue contract with BullMQ and QStash adapters
  ui/           Shared source-owned UI primitives
```

See [docs/architecture.md](docs/architecture.md) for the entity diagram, incident state machine, idempotency keys, outbox lifecycle, deployment modes, and operational trade-offs.

## Technology stack

| Layer        | Technology                                                        |
| ------------ | ----------------------------------------------------------------- |
| Web          | Next.js 16, React 19, Tailwind CSS 4, Radix UI                    |
| API          | NestJS 11, Zod contracts, Better Auth                             |
| Data         | PostgreSQL 17, Drizzle ORM                                        |
| Local queue  | BullMQ 5 and Redis 7                                              |
| Hosted queue | Upstash QStash signed callbacks                                   |
| Delivery     | SMTP/Mailpit locally, Resend and signed webhooks when hosted      |
| Quality      | TypeScript strict mode, ESLint, Prettier, Vitest, Playwright, axe |
| Tooling      | pnpm 11 and Turborepo 2                                           |

## Local setup

Requirements:

- Node.js 22.13 or newer
- pnpm 11.13.1
- Docker Desktop with Linux containers

From the repository root in PowerShell:

```powershell
npm install --global pnpm@11.13.1
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm infra:up
$env:DATABASE_URL = "postgresql://devrelay:devrelay_local@localhost:5432/devrelay"
pnpm db:migrate
pnpm dev
```

Open the web app at [http://localhost:3000](http://localhost:3000), the API health endpoint at [http://localhost:4000/health](http://localhost:4000/health), and Mailpit at [http://localhost:8025](http://localhost:8025). Stop application processes with `Ctrl+C`, then preserve or reset local infrastructure with:

```powershell
pnpm infra:down
pnpm infra:reset # permanently deletes only this Compose project's local volumes
```

## Environment variables

Copy `.env.example` and keep real secrets outside Git. The example groups every supported setting; the important production groups are:

| Group          | Variables                                                                                | Purpose                                                                               |
| -------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Database       | `DATABASE_URL`                                                                           | Pooled application connection; use a direct connection only for controlled migrations |
| Authentication | `APP_ORIGIN`, `AUTH_BASE_URL`, `AUTH_SECRET`, optional GitHub OAuth values               | Allowed browser origin, callbacks, sessions, and OAuth                                |
| Queue          | `QUEUE_ADAPTER`, `REDIS_URL`, `QSTASH_*`                                                 | Select BullMQ locally or signed QStash callbacks when hosted                          |
| Monitoring     | `QSTASH_DISPATCH_BATCH_SIZE`, `QSTASH_DAILY_MESSAGE_LIMIT`, heartbeat settings           | Bound scheduling and expose stale-worker evidence                                     |
| Delivery       | SMTP/Mailpit values, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`                           | Local capture or controlled hosted email                                              |
| Encryption     | `NOTIFICATION_ENCRYPTION_KEY`                                                            | Encrypt webhook secrets and sensitive callback material at rest                       |
| Retention      | `CHECK_RESULT_RETENTION_DAYS`, `DELIVERY_ATTEMPT_RETENTION_DAYS`, `TOKEN_RETENTION_DAYS` | Configure bounded, idempotent cleanup                                                 |

Production requires unique authentication and notification encryption secrets. Do not reuse the development examples. QStash must stay paused until migrations, callbacks, origins, and provider credentials have been verified.

## Supported monitor protocols

- **HTTP:** public `http`/`https` endpoints using `GET` or `HEAD`, bounded redirects, request headers, status-code policy, timeout, and response size.
- **TLS:** public HTTPS endpoints on port 443 with platform trust-chain and hostname validation, Server Name Indication, TLS 1.2/1.3, and an expiry-warning threshold. Results retain only negotiated TLS version and expiry summary.
- **DNS:** exact normalized A, AAAA, CNAME, MX, or TXT record-set matching. Resolver answers are bounded; DNS errors and unexpected records are failures, never healthy evidence.

The automated suite injects TLS and DNS runners rather than using public domains or live certificates. Local development needs no certificate authority or hosted DNS fixture. DNSSEC, custom resolvers, TCP, domain-expiry, and browser-synthetic monitoring remain outside this MVP.

## Validation

Start local infrastructure, install Chromium once, and run the complete release gate:

```powershell
pnpm infra:up
pnpm exec playwright install chromium
pnpm check
```

`pnpm check` runs formatting, linting, package boundaries, strict type checks, unit tests, PostgreSQL/Redis integration tests, rendered desktop/mobile browser journeys, accessibility checks, and production builds. Individual commands are also available:

```powershell
pnpm format:check
pnpm lint
pnpm boundaries
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

## Measured reliability

The release proof contains 201 automated checks: 113 unit tests, 75 PostgreSQL/Redis integration tests, and 13 rendered Chromium scenarios. Phase 17 protocol coverage uses deterministic injected TLS/DNS runners and database integration cases rather than public domains or live certificate expiry. The fault suite covers duplicate and out-of-order messages, simultaneous incident creation, killed database work, queue-client restarts, notification retries, scheduler stoppage, role boundaries, responsive behavior, keyboard paths, and axe accessibility rules.

A representative local run seeded 6,000 check windows/results and 2,000 audit events. PostgreSQL selected the dedicated recent-monitor and tenant audit-timeline indexes, and the focused fault/load suite completed in 1.15 seconds while retention stayed below its five-second non-blocking gate. Detection and recovery are policy-bound rather than claimed as network benchmarks: with the hosted minimum five-minute interval, the default three-failure/two-success policy confirms an outage after three consecutive results and recovery after two consecutive successes. Hosted end-to-end notification latency is not yet published as a performance claim.

Full methodology and local-versus-hosted labels are in [docs/reliability.md](docs/reliability.md).

## Deployment and free-tier limits

Production uses two Vercel Hobby projects, a Neon Free PostgreSQL project, one QStash dispatcher schedule, and controlled Resend Free delivery. The hosted safeguards enforce:

- five active monitors across the demo, regardless of protocol;
- a minimum 300-second hosted interval;
- batches of at most five and an application cap of 250 QStash messages per UTC day;
- 30-day check-result and delivery-attempt retention;
- seven-day expired-token retention; and
- no payment method, paid plan, or automatic overage.

Quota or provider failure leaves durable work pending or failed for inspection; it does not convert failure into success. Current provider ceilings and the ₹0 operating procedure are documented in [docs/free-tier-budget.md](docs/free-tier-budget.md).

## Security boundaries

DevRelay treats tenant identity, outbound monitoring, provider callbacks, queue duplication, secrets, and public incident projection as explicit trust boundaries. Every tenant-owned query is organization-scoped; HTTP/TLS monitor destinations are restricted to public HTTPS/HTTP addresses and pinned after DNS validation; DNS checks use only the supported record types and bounded safe summaries; callback signatures and replay identities are verified; public projections use allowlisted fields; and raw response bodies, certificates, resolver replies, secrets, and private incident notes are excluded from public output.

Application-layer SSRF controls are not a substitute for a deny-by-default egress firewall, and the free hosted tier does not provide that network boundary. The existing repository security review and its regression coverage are summarized in [docs/security.md](docs/security.md). Outgoing webhook consumers should follow [docs/outgoing-webhooks.md](docs/outgoing-webhooks.md).

## Roadmap

The MVP intentionally defers TCP, domain-expiry, browser-synthetic, DNSSEC, custom-resolver, and authoritative-DNS monitors; multi-region quorum checks; on-call rotations; Slack/Teams/SMS delivery; billing; custom domains; long-term archives; and advanced SLO burn-rate analytics. The next reliability priorities are network-level egress isolation, a supported tenant export/deletion workflow, and hosted performance sampling after enough real traffic exists to report meaningful numbers.

## License

DevRelay is licensed under the MIT License. See [LICENSE](LICENSE) for the full license text.
