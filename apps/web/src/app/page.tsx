import {
  Activity,
  ArrowRight,
  BookOpenCheck,
  Braces,
  CheckCircle2,
  CircleDotDashed,
  ClockArrowUp,
  Code2,
  Database,
  FileClock,
  Gauge,
  Megaphone,
  RadioTower,
  RefreshCcw,
  ScanSearch,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import Link from "next/link";

import { MarketingHeader } from "@/components/marketing-header";
import { StatusBadge } from "@/components/operational-status";
import { PublicFooter } from "@/components/public-footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const workflow = [
  {
    title: "Monitor",
    description: "Run policy-based checks on a predictable cadence.",
    icon: RadioTower,
  },
  {
    title: "Confirm",
    description: "Require consecutive evidence before opening an incident.",
    icon: ScanSearch,
  },
  {
    title: "Coordinate",
    description: "Keep transitions, evidence, and internal context in one timeline.",
    icon: Activity,
  },
  {
    title: "Communicate",
    description: "Publish clear updates and deliver them with retry safety.",
    icon: Megaphone,
  },
  {
    title: "Learn",
    description: "Turn resolved incidents into durable postmortems and actions.",
    icon: BookOpenCheck,
  },
];

const reliability = [
  {
    title: "Idempotent by default",
    description: "Stable event and delivery keys prevent duplicate incidents and notifications.",
    icon: CircleDotDashed,
  },
  {
    title: "Retry-safe delivery",
    description: "Outbox-backed fan-out records every attempt without repeating successful work.",
    icon: RefreshCcw,
  },
  {
    title: "Recoverable workers",
    description: "Leases, heartbeats, and stale-work reclamation keep processing moving.",
    icon: ClockArrowUp,
  },
  {
    title: "Auditable changes",
    description:
      "Immutable actor, target, source, and safe metadata records explain every decision.",
    icon: FileClock,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main>
        <section className="relative overflow-hidden border-b border-border-subtle">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_top,var(--brand-soft),transparent_70%)] opacity-70"
          />
          <div className="mx-auto max-w-7xl px-4 pb-16 pt-20 sm:px-6 lg:pb-24 lg:pt-28">
            <div className="mx-auto max-w-4xl text-center">
              <p className="mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-text-link">
                <RadioTower aria-hidden="true" className="size-4" />
                Reliability operations for focused teams
              </p>
              <h1 className="text-balance text-5xl font-bold leading-[1.08] tracking-[-0.045em] sm:text-6xl">
                From failed check to trusted customer update—without losing the thread.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-text-secondary">
                DevRelay connects monitoring, incident coordination, and public communication in one
                calm, production-oriented workflow.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button asChild size="lg">
                  <Link href="/app/acme">
                    Open the demo <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="#architecture">
                    View architecture <Braces aria-hidden="true" />
                  </Link>
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Free hosted demo · Seeded data · No credit card or paid service required
              </p>
            </div>

            <section
              aria-labelledby="product-frame-title"
              className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-xl border bg-card shadow-elevation-md"
            >
              <div className="flex items-center justify-between border-b bg-surface-subtle px-4 py-3">
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="size-2.5 rounded-full bg-border-strong" />
                  <span className="size-2.5 rounded-full bg-border-strong" />
                  <span className="size-2.5 rounded-full bg-border-strong" />
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  app.devrelay.dev/acme/incidents/inc_01
                </p>
                <StatusBadge status="partial_outage" />
              </div>
              <div className="grid gap-6 p-5 md:grid-cols-[1.25fr_0.75fr] md:p-7">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    ACTIVE INCIDENT · SEV-2
                  </p>
                  <h2
                    className="mt-2 text-2xl font-semibold tracking-tight"
                    id="product-frame-title"
                  >
                    API requests returning elevated 5xx errors
                  </h2>
                  <p className="mt-2 text-sm text-text-secondary">
                    Started 18 minutes ago · API Gateway and Checkout affected
                  </p>
                  <ol className="mt-6 space-y-4 border-l border-border-default pl-5">
                    <li>
                      <p className="text-sm font-medium">Monitoring recovery</p>
                      <p className="mt-1 text-sm text-text-secondary">
                        Error rate is declining after traffic shifted to the healthy pool.
                      </p>
                      <time className="mt-1 block font-mono text-xs text-muted-foreground">
                        14:32 UTC
                      </time>
                    </li>
                    <li>
                      <p className="text-sm font-medium">Public update delivered</p>
                      <p className="mt-1 text-sm text-text-secondary">
                        1,248 subscribers notified; webhook delivery is complete.
                      </p>
                      <time className="mt-1 block font-mono text-xs text-muted-foreground">
                        14:26 UTC
                      </time>
                    </li>
                    <li>
                      <p className="text-sm font-medium">Incident confirmed</p>
                      <p className="mt-1 text-sm text-text-secondary">
                        Three consecutive failed checks crossed the service policy.
                      </p>
                      <time className="mt-1 block font-mono text-xs text-muted-foreground">
                        14:18 UTC
                      </time>
                    </li>
                  </ol>
                </div>
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardDescription>Customer communication</CardDescription>
                      <CardTitle className="text-base">Latest public update</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-md border border-primary bg-brand-soft p-3 text-sm text-brand-soft-foreground">
                        <Megaphone aria-hidden="true" className="mb-2 size-4" />
                        We have shifted traffic and are seeing recovery. We continue to monitor.
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardDescription>Delivery health</CardDescription>
                      <CardTitle className="font-mono text-2xl tabular-nums">99.92%</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-text-secondary">
                      Notifications delivered within 30 seconds.
                    </CardContent>
                  </Card>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6" id="product">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-link">
              One connected loop
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Move deliberately from signal to learning.
            </h2>
            <p className="mt-3 text-base leading-7 text-text-secondary">
              Each stage preserves the evidence the next one needs.
            </p>
          </div>
          <ol className="mt-10 grid gap-4 md:grid-cols-5">
            {workflow.map(({ title, description, icon: Icon }, index) => (
              <li className="relative rounded-lg border bg-card p-5" key={title}>
                <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                <Icon aria-hidden="true" className="mt-6 size-5 text-primary" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y border-border-subtle bg-surface-subtle" id="reliability">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-link">
                Reliability is product behavior
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Failure modes are designed, tested, and visible.
              </h2>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-xl border bg-border-default sm:grid-cols-2 lg:grid-cols-4">
              {reliability.map(({ title, description, icon: Icon }) => (
                <article className="bg-card p-6" key={title}>
                  <Icon aria-hidden="true" className="size-5 text-primary" />
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-link">
              Three coordinated surfaces
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              The right amount of context for each audience.
            </h2>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {[
              {
                title: "Operations dashboard",
                description:
                  "Service health, check freshness, active incidents, latency, and upcoming maintenance.",
                icon: Gauge,
                href: "/app/acme",
              },
              {
                title: "Incident command console",
                description:
                  "Authoritative timeline, explicit public/private composers, evidence, delivery, and transitions.",
                icon: Activity,
                href: "/app/acme/incidents/inc-api-errors",
              },
              {
                title: "Public status",
                description:
                  "Mobile-first health, active incident updates, service history, maintenance, and subscriptions.",
                icon: Megaphone,
                href: "/status/acme",
              },
            ].map(({ title, description, icon: Icon, href }) => (
              <Card key={title}>
                <CardHeader>
                  <Icon aria-hidden="true" className="mb-4 size-6 text-primary" />
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline">
                    <Link href={href}>
                      Explore surface <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-y border-border-subtle bg-card" id="architecture">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-link">
                Architecture
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Clear boundaries from request to recovery.
              </h2>
              <p className="mt-4 text-base leading-7 text-text-secondary">
                A Next.js application and NestJS API share versioned contracts. PostgreSQL owns
                durable state, while queue-backed workers execute checks and delivery with leases,
                retries, and idempotency.
              </p>
              <Button asChild className="mt-6" variant="outline">
                <a href="https://github.com/neevj2006/DevRelay">
                  <Code2 aria-hidden="true" />
                  Read the source
                </a>
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  label: "Web application",
                  detail: "Next.js · React · accessible server-rendered surfaces",
                  icon: Braces,
                },
                {
                  label: "Application API",
                  detail: "NestJS · validation · authorization · domain services",
                  icon: ShieldCheck,
                },
                {
                  label: "Durable state",
                  detail: "PostgreSQL · Drizzle · constraints · transactions",
                  icon: Database,
                },
                {
                  label: "Asynchronous work",
                  detail: "Queues · leases · retry policy · webhooks",
                  icon: Webhook,
                },
              ].map(({ label, detail, icon: Icon }) => (
                <div className="rounded-lg border bg-background p-5" key={label}>
                  <Icon aria-hidden="true" className="size-5 text-primary" />
                  <h3 className="mt-4 font-semibold">{label}</h3>
                  <p className="mt-2 font-mono text-xs leading-5 text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6">
          <CheckCircle2
            aria-hidden="true"
            className="mx-auto size-8 text-[var(--status-operational-fg)]"
          />
          <h2 className="mt-5 text-3xl font-semibold tracking-tight">
            See the complete incident lifecycle in the seeded demo.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-text-secondary">
            Explore healthy, degraded, outage, stale, delivery, and recovery states without
            connecting an external service.
          </p>
          <Button asChild className="mt-7" size="lg">
            <Link href="/app/acme">
              Open DevRelay <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
