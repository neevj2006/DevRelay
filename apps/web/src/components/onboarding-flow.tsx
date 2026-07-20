"use client";

import { ArrowLeft, ArrowRight, Check, LoaderCircle, RadioTower } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/form-field";
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

const steps = ["Organization", "Ready"] as const;

export function slugifyOrganizationName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [organizationName, setOrganizationName] = useState("");
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const previewUrl = `devrelay.dev/status/${slug || "your-team"}`;

  async function createWorkspace() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/backend/organizations", {
        body: JSON.stringify({ name: organizationName, slug }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        toast.error(body?.message ?? "The organization could not be created.");
        return;
      }
      router.push(`/app/${slug}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-2xl">
      <ol aria-label="Onboarding progress" className="mb-8 grid grid-cols-2 gap-2">
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
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--status-operational-bg)] text-[var(--status-operational-fg)]">
                <Check aria-hidden="true" className="size-6" />
              </div>
              <CardTitle>{organizationName || "Your organization"} is ready</CardTitle>
              <CardDescription>
                Your workspace will start empty. Add only the services and endpoints that belong to
                your organization.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 rounded-lg border bg-surface-subtle p-5 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Organization</dt>
                  <dd className="mt-1 font-medium">{organizationName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Public URL</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{previewUrl}</dd>
                </div>
              </dl>
              <p className="mt-5 flex gap-2 text-sm text-text-secondary">
                <RadioTower aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                Next, create your first service and add an endpoint monitor to begin collecting real
                availability evidence.
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
              disabled={step === 0 && (!organizationName || !slug)}
              onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}
            >
              Continue <ArrowRight aria-hidden="true" />
            </Button>
          ) : (
            <Button disabled={submitting} onClick={createWorkspace}>
              {submitting ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
              Open workspace <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </CardFooter>
      </Card>
      <p className="mt-5 text-center text-xs text-muted-foreground">
        The organization is created only when you open the workspace.
      </p>
    </div>
  );
}
