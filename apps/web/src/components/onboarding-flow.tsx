"use client";

import { ArrowLeft, ArrowRight, Check, RadioTower } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { FormField } from "@/components/form-field";
import { StatusBadge } from "@/components/operational-status";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const steps = ["Organization", "First service", "Ready"] as const;

export function slugifyOrganizationName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function OnboardingFlow() {
  const [step, setStep] = useState(0);
  const [organizationName, setOrganizationName] = useState("Acme Cloud");
  const [slug, setSlug] = useState("acme");
  const [serviceName, setServiceName] = useState("API Gateway");
  const [isPublic, setIsPublic] = useState(true);
  const previewUrl = `devrelay.dev/status/${slug || "your-team"}`;

  return (
    <div className="w-full max-w-2xl">
      <ol aria-label="Onboarding progress" className="mb-8 grid grid-cols-3 gap-2">
        {steps.map((label, index) => (
          <li
            aria-current={index === step ? "step" : undefined}
            className="flex items-center gap-2"
            key={label}
          >
            <span
              className={`flex size-7 items-center justify-center rounded-full border text-xs font-semibold ${index <= step ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
            >
              {index < step ? <Check aria-hidden="true" className="size-4" /> : index + 1}
            </span>
            <span
              className={`hidden text-sm sm:inline ${index === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>
      <Card className="shadow-elevation-sm">
        {step === 0 ? (
          <>
            <CardHeader>
              <CardTitle>Create your organization</CardTitle>
              <CardDescription>
                This becomes the tenant boundary for members, services, incidents, and status
                communication.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField
                description="Use the team or product name customers recognize."
                id="organization-name"
                label="Organization name"
                required
              >
                <Input
                  onChange={(event) => {
                    setOrganizationName(event.target.value);
                    setSlug(slugifyOrganizationName(event.target.value));
                  }}
                  value={organizationName}
                />
              </FormField>
              <FormField
                description={`Public preview: ${previewUrl}`}
                id="organization-slug"
                label="Organization slug"
                required
              >
                <Input
                  onChange={(event) => setSlug(slugifyOrganizationName(event.target.value))}
                  value={slug}
                />
              </FormField>
            </CardContent>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <CardHeader>
              <CardTitle>Add the first service</CardTitle>
              <CardDescription>
                A service is the customer-visible system whose health DevRelay communicates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                description="You can add HTTP monitoring after onboarding."
                id="service-name"
                label="Service name"
                required
              >
                <Input
                  onChange={(event) => setServiceName(event.target.value)}
                  value={serviceName}
                />
              </FormField>
              <div className="flex items-start justify-between gap-4 rounded-lg border bg-surface-subtle p-4">
                <div>
                  <Label htmlFor="public-service">Show on public status page</Label>
                  <p className="mt-1 text-[13px] leading-5 text-text-secondary">
                    Customers can see service state and related public incidents.
                  </p>
                </div>
                <Switch checked={isPublic} id="public-service" onCheckedChange={setIsPublic} />
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs font-semibold text-muted-foreground">STATUS PAGE PREVIEW</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="font-medium">{serviceName || "Untitled service"}</span>
                  <StatusBadge status="operational" />
                </div>
              </div>
            </CardContent>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <CardHeader>
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--status-operational-bg)] text-[var(--status-operational-fg)]">
                <Check aria-hidden="true" className="size-6" />
              </div>
              <CardTitle>{organizationName || "Your organization"} is ready</CardTitle>
              <CardDescription>
                The seeded workspace starts healthy so you can explore monitoring, incidents, and
                communication safely.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 rounded-lg border bg-surface-subtle p-5 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Organization</dt>
                  <dd className="mt-1 font-medium">{organizationName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">First service</dt>
                  <dd className="mt-1 font-medium">{serviceName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Public URL</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{previewUrl}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Visibility</dt>
                  <dd className="mt-1 font-medium">{isPublic ? "Public" : "Private"}</dd>
                </div>
              </dl>
              <p className="mt-5 flex gap-2 text-sm text-text-secondary">
                <RadioTower aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                Next, create a monitor to begin collecting real availability evidence.
              </p>
            </CardContent>
          </>
        ) : null}
        <CardFooter className="flex justify-between border-t pt-5">
          <Button
            disabled={step === 0}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            variant="ghost"
          >
            <ArrowLeft aria-hidden="true" />
            Back
          </Button>
          {step < steps.length - 1 ? (
            <Button
              disabled={
                (step === 0 && (!organizationName || !slug)) || (step === 1 && !serviceName)
              }
              onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}
            >
              Continue <ArrowRight aria-hidden="true" />
            </Button>
          ) : (
            <Button asChild>
              <Link href={`/app/${slug || "acme"}`}>
                Open workspace <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          )}
        </CardFooter>
      </Card>
      <p className="mt-5 text-center text-xs text-muted-foreground">
        Progress is designed to be resumable when authentication is connected.
      </p>
    </div>
  );
}
