# DevRelay

[![CI](https://github.com/neevj2006/DevRelay/actions/workflows/ci.yml/badge.svg)](https://github.com/neevj2006/DevRelay/actions/workflows/ci.yml)

DevRelay is a multi-tenant incident response, service monitoring, and public status platform for small engineering teams. It is designed to monitor HTTP services, confirm outages under configurable policies, coordinate incident updates, notify subscribers safely, and preserve a reliable operational history.

## Project goals

- Monitor HTTP services on a schedule.
- Reduce false positives with configurable failure and recovery thresholds.
- Create one incident even when jobs are duplicated or retried.
- Give responders a clear incident timeline with separate public updates and private notes.
- Publish accessible, real-time public status pages.
- Deliver retry-safe email and signed webhook notifications.
- Maintain tenant isolation, audit history, availability analytics, and postmortems.
- Demonstrate reliability through automated tests and fault injection.

## Repository structure

```text
apps/
  api/          NestJS API and hosted job receivers
  web/          Next.js App Router application
  worker/       Persistent local background workers
packages/
  config/       Validated environment contracts
  contracts/    Shared HTTP and job contracts
  database/     Database schema and access layer
  execution/    Scheduler, monitor execution, heartbeat, and outbox services
  monitoring/   Check execution and policy domain
  queue/        Shared queue interface and adapters
  ui/           Shared source-owned components
```

Turborepo orchestrates builds, linting, type checks, tests, and development processes across the pnpm workspace.

## Requirements

- Node.js 22.13 or newer
- pnpm 11.13.1
- Docker Desktop with Linux containers

Install pnpm if it is not already available:

```powershell
npm install --global pnpm@11.13.1
```

## Windows and PowerShell setup

From the repository root:

```powershell
pnpm install
Copy-Item .env.example .env
pnpm infra:up
pnpm dev
```

The default local endpoints are:

- Web: [http://localhost:3000](http://localhost:3000)
- API health: [http://localhost:4000/health](http://localhost:4000/health)
- Mailpit: [http://localhost:8025](http://localhost:8025)
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

The web, API, and worker development processes run together through `pnpm dev`. This command builds the shared packages first and then starts all three applications without requiring Turborepo's native executable, which can be blocked by Windows Application Control. Stop the processes with `Ctrl+C`.

## Local infrastructure

```powershell
pnpm infra:up       # Start PostgreSQL, Redis, and Mailpit and wait for health
pnpm infra:status   # Inspect container status
pnpm infra:logs     # Follow service logs
pnpm infra:down     # Stop containers and preserve data
pnpm infra:reset    # Stop containers and delete local development volumes
```

`infra:reset` permanently deletes only the Docker volumes created by this Compose project.

## Monitoring execution modes

Local development uses BullMQ and Redis. The worker derives deterministic check windows, persists
the expected window before enqueueing it, safely retries transient failures, and deduplicates the
result by organization, monitor, and scheduled timestamp. Queue failures remain available for
inspection, and pending database windows are republished after a scheduler interruption.

Hosted deployments can set `QUEUE_ADAPTER=qstash` and configure the QStash token, current and next
signing keys, and the public API base URL documented in `.env.example`. All hosted callbacks verify
the QStash signature against the unparsed request body. Create or reconcile the single five-minute
dispatcher schedule with:

```powershell
pnpm --filter @devrelay/api qstash:schedule
```

Keep `QSTASH_HOSTED_SCHEDULER_PAUSED=true` until the public endpoint and credentials are ready. The
hosted dispatcher enforces both a bounded batch size and a daily message ceiling.

## Validation

With local infrastructure running, execute every required check with one command:

```powershell
pnpm check
```

This verifies formatting, linting, import ordering, package boundaries, strict TypeScript, unit tests, PostgreSQL/Redis integration, and production builds.

Individual commands are also available:

```powershell
pnpm format:check
pnpm lint
pnpm boundaries
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

## License

No license has been selected yet. All rights are reserved until a license is added.
