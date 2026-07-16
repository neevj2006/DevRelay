"use client";

import {
  Building2,
  Check,
  ChevronsUpDown,
  CircleUserRound,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  isNavigationPathActive,
  navigationForRole,
  type OrganizationRole,
} from "@/components/app-navigation";
import { Brand } from "@/components/brand";
import { ThemeSelector } from "@/components/theme-selector";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type AppShellProps = {
  orgSlug: string;
  organizations: ReadonlyArray<{ name: string; slug: string }>;
  children: React.ReactNode;
  role?: OrganizationRole;
  user: { email: string; name: string };
};

function OrganizationSwitcher({
  orgSlug,
  organizations,
  collapsed = false,
}: {
  orgSlug: string;
  organizations: ReadonlyArray<{ name: string; slug: string }>;
  collapsed?: boolean;
}) {
  const active = organizations.find((organization) => organization.slug === orgSlug) ?? {
    slug: orgSlug,
    name: orgSlug.replaceAll("-", " "),
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Current organization: ${active.name}`}
          className={cn("w-full", !collapsed && "justify-between")}
          size={collapsed ? "icon" : "default"}
          variant="outline"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Building2 aria-hidden="true" />
            {!collapsed ? <span className="truncate capitalize">{active.name}</span> : null}
          </span>
          {!collapsed ? (
            <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {organizations.map((organization) => (
          <DropdownMenuItem asChild key={organization.slug}>
            <Link href={`/app/${organization.slug}`}>
              <Building2 aria-hidden="true" />
              <span className="flex-1">{organization.name}</span>
              {organization.slug === active.slug ? <Check aria-hidden="true" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountMenu({ user }: { user: { email: string; name: string } }) {
  const initials =
    user.name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || user.email.slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Open ${initials} account menu`}
          className="rounded-full"
          size="icon"
          variant="ghost"
        >
          <Avatar className="size-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <span className="block">{user.name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <CircleUserRound aria-hidden="true" />
          Account settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            authClient.signOut({
              fetchOptions: { onSuccess: () => window.location.assign("/sign-in") },
            })
          }
        >
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Navigation({
  orgSlug,
  role,
  collapsed = false,
}: {
  orgSlug: string;
  role: OrganizationRole;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace" className="space-y-5">
      {navigationForRole(role).map((group, groupIndex) => (
        <section key={group.label ?? groupIndex}>
          {group.label && !collapsed ? (
            <h2 className="mb-1 px-3 text-xs font-semibold text-muted-foreground">{group.label}</h2>
          ) : null}
          {group.label && collapsed ? (
            <div aria-hidden="true" className="mx-3 mb-2 border-t" />
          ) : null}
          <ul className="space-y-1">
            {group.items.map((item) => {
              const href = `/app/${orgSlug}${item.segment}`;
              const active = isNavigationPathActive(pathname, href);
              const content = (
                <>
                  <item.icon aria-hidden="true" className="size-4 shrink-0" />
                  {!collapsed ? <span>{item.label}</span> : null}
                </>
              );
              return (
                <li key={item.segment || "overview"}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          aria-current={active ? "page" : undefined}
                          aria-label={item.label}
                          className={cn(
                            "flex h-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
                            active && "bg-sidebar-accent text-foreground",
                          )}
                          href={href}
                        >
                          {content}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
                        active &&
                          "border-l-[3px] border-primary bg-sidebar-accent pl-[9px] text-foreground",
                      )}
                      href={href}
                    >
                      {content}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function Breadcrumbs({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean).slice(2);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
        <li>
          <Link className="hover:text-foreground" href={`/app/${orgSlug}`}>
            Overview
          </Link>
        </li>
        {parts.map((part, index) => {
          const href = `/app/${orgSlug}/${parts.slice(0, index + 1).join("/")}`;
          const current = index === parts.length - 1;
          return (
            <li className="flex min-w-0 items-center gap-2" key={href}>
              <span aria-hidden="true">/</span>
              {current ? (
                <span aria-current="page" className="truncate capitalize text-foreground">
                  {part.replaceAll("-", " ")}
                </span>
              ) : (
                <Link className="truncate capitalize hover:text-foreground" href={href}>
                  {part.replaceAll("-", " ")}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function AppShell({
  orgSlug,
  organizations,
  role = "owner",
  children,
  user,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <a
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:translate-y-0"
        href="#main-content"
      >
        Skip to content
      </a>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r bg-sidebar transition-[width] duration-[180ms] lg:flex lg:flex-col",
          collapsed ? "w-[72px]" : "w-60",
        )}
      >
        <div
          className={cn(
            "flex h-14 items-center border-b",
            collapsed ? "justify-center px-2" : "justify-between px-4",
          )}
        >
          <Link aria-label="DevRelay overview" href={`/app/${orgSlug}`}>
            <Brand className={cn(collapsed && "[&>span]:hidden")} />
          </Link>
          {!collapsed ? (
            <Button
              aria-label="Collapse sidebar"
              onClick={() => setCollapsed(true)}
              size="icon-sm"
              variant="ghost"
            >
              <PanelLeftClose aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <div className="p-3">
          <OrganizationSwitcher
            collapsed={collapsed}
            organizations={organizations}
            orgSlug={orgSlug}
          />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <Navigation collapsed={collapsed} orgSlug={orgSlug} role={role} />
        </div>
        <div className="border-t p-3">
          {collapsed ? (
            <Button
              aria-label="Expand sidebar"
              onClick={() => setCollapsed(false)}
              size="icon"
              variant="ghost"
            >
              <PanelLeftOpen aria-hidden="true" />
            </Button>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-text-secondary">
              <span className="size-2 rounded-full bg-[var(--status-operational-fg)]" />
              Production
            </div>
          )}
        </div>
      </aside>

      <div
        className={cn(
          "transition-[padding] duration-[180ms]",
          collapsed ? "lg:pl-[72px]" : "lg:pl-60",
        )}
      >
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur sm:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                aria-label="Open navigation"
                className="lg:hidden"
                size="icon"
                variant="ghost"
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[min(20rem,90vw)] p-0" side="left">
              <SheetHeader className="border-b p-4 text-left">
                <SheetTitle>
                  <Brand />
                </SheetTitle>
                <SheetDescription>Navigate Acme Cloud operations.</SheetDescription>
              </SheetHeader>
              <div className="p-4">
                <OrganizationSwitcher organizations={organizations} orgSlug={orgSlug} />
              </div>
              <div className="overflow-y-auto px-4 pb-6">
                <Navigation orgSlug={orgSlug} role={role} />
              </div>
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <Breadcrumbs orgSlug={orgSlug} />
          </div>
          <span className="hidden items-center gap-2 rounded-full border px-2.5 py-1 text-xs text-text-secondary sm:flex">
            <span className="size-2 rounded-full bg-[var(--status-operational-fg)]" />
            Production
          </span>
          <ThemeSelector />
          <AccountMenu user={user} />
        </header>
        <div className="border-b border-[var(--status-degraded-border)] bg-[var(--status-degraded-bg)] px-4 py-2 text-[13px] text-[var(--status-degraded-fg)] sm:px-6">
          <div className="mx-auto flex max-w-[1440px] items-center gap-2">
            <TriangleAlert aria-hidden="true" className="size-4" />
            <span>
              <strong>Free demo:</strong> 3 of 5 monitors in use.
            </span>
          </div>
        </div>
        <main className="mx-auto w-full max-w-[1440px] p-4 sm:p-6" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
