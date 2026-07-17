import { Bell, RadioTower } from "lucide-react";
import Link from "next/link";

import { ThemeSelector } from "@/components/theme-selector";
import { Button } from "@/components/ui/button";

export function StatusPageHeader({ slug, title }: { slug: string; title?: string }) {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-16 max-w-[960px] items-center gap-3 px-4 sm:px-6">
        <Link
          className="mr-auto inline-flex items-center gap-2 font-semibold"
          href={`/status/${slug}`}
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <RadioTower aria-hidden="true" className="size-4" />
          </span>
          {title ?? `${slug.replaceAll("-", " ")} status`}
        </Link>
        <ThemeSelector />
        <Button asChild size="sm" variant="outline">
          <Link href="#subscribe">
            <Bell aria-hidden="true" />
            Subscribe
          </Link>
        </Button>
      </div>
    </header>
  );
}
