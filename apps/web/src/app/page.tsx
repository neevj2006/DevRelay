import { ArrowRight, Code2, RadioTower } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { operationalStatuses, StatusBadge } from "@/components/operational-status";
import { ThemeSelector } from "@/components/theme-selector";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border-subtle bg-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Brand className="text-base" />
          <nav aria-label="Primary" className="flex items-center gap-2">
            <ThemeSelector />
            <Button asChild size="sm" variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border-subtle">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(circle_at_top,var(--brand-soft),transparent_68%)] opacity-70"
        />
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-28">
          <div>
            <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-text-link">
              <RadioTower aria-hidden="true" className="size-4" /> Calm incident operations
            </p>
            <h1 className="max-w-3xl text-balance text-4xl font-bold leading-[1.08] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              Detect incidents. Coordinate clearly. Communicate reliably.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-text-secondary sm:text-lg">
              DevRelay gives small engineering teams one dependable place for monitoring, incident
              response, and public status communication.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/sign-in">
                  Open the demo <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="https://github.com/neevj2006/DevRelay">
                  <Code2 aria-hidden="true" />
                  View source
                </a>
              </Button>
            </div>
          </div>

          <section
            aria-labelledby="status-preview-title"
            className="rounded-xl border bg-card p-5 shadow-elevation-xs sm:p-6"
          >
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div>
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  devrelay.app/status/acme
                </p>
                <h2 className="mt-1 text-base font-semibold" id="status-preview-title">
                  Service state vocabulary
                </h2>
              </div>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-[var(--status-operational-fg)]" />
                Live
              </span>
            </div>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {operationalStatuses.map((status) => (
                <li key={status}>
                  <StatusBadge className="w-full justify-start" status={status} />
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-6 text-text-secondary">
              Every operational state combines text, an icon, and independently tuned light and dark
              theme colors.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
