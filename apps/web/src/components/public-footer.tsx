import Link from "next/link";

import { Brand } from "@/components/brand";

export function PublicFooter() {
  return (
    <footer className="border-t border-border-subtle bg-card">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <Brand className="text-foreground" />
          <p className="mt-2">
            A portfolio-grade reliability platform built with open-source tools.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link className="hover:text-foreground" href="/status/acme">
            Public status
          </Link>
          <a className="hover:text-foreground" href="https://github.com/neevj2006/DevRelay">
            Source
          </a>
          <Link className="hover:text-foreground" href="/sign-in">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
