# DevRelay

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

## Planned technology stack

- Next.js App Router and TypeScript
- Tailwind CSS
- NestJS for structured backend services
- PostgreSQL and Drizzle ORM
- Redis and BullMQ for the full local worker environment
- Upstash QStash for the free hosted demonstration
- Server-Sent Events for live status updates
- Vitest, Playwright, and Testcontainers
- Docker Compose for local infrastructure
- Vercel for the web deployment

## Current status

The repository currently contains the initial Next.js application foundation. Product features will be implemented incrementally through focused pull requests with automated validation.

## Development

Requirements:

- Node.js 20.9 or newer
- npm

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Validation

```bash
npm run lint
npm run typecheck
npm run build
```

Run every available validation step with:

```bash
npm run check
```

## Deployment

The application is compatible with Vercel's standard Next.js deployment flow. The production deployment will track `main`, while pull requests will use preview deployments when available.

## Budget

The public portfolio deployment is designed to remain within free service tiers. Paid infrastructure, usage-based billing, and automatic upgrades are outside the project scope unless explicitly approved.

## License

No license has been selected yet. All rights are reserved until a license is added.
