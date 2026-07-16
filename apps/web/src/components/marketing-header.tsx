import Link from "next/link";

import { Brand } from "@/components/brand";
import { ThemeSelector } from "@/components/theme-selector";
import { Button } from "@/components/ui/button";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link aria-label="DevRelay home" className="mr-auto" href="/">
          <Brand className="text-base" />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          <Button asChild size="sm" variant="ghost">
            <Link href="/#product">Product</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/#reliability">Reliability</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/#architecture">Architecture</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <a href="https://github.com/neevj2006/DevRelay">GitHub</a>
          </Button>
        </nav>
        <ThemeSelector />
        <Button asChild size="sm">
          <Link href="/app/acme">Open demo</Link>
        </Button>
      </div>
    </header>
  );
}
