"use client";

import { ArrowLeft, ArrowRight, Check, FlaskConical, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { InlineFeedback } from "@/components/feedback";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const steps = ["Basics", "Request", "Policy", "Test", "Review"] as const;

export function MonitorWizard({ orgSlug, serviceId }: { orgSlug: string; serviceId: string }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("API health");
  const [endpoint, setEndpoint] = useState("https://api.acme.test/health");
  const [tested, setTested] = useState(false);
  return (
    <div className="space-y-6">
      <ol aria-label="Monitor creation progress" className="grid grid-cols-5 gap-2">
        {steps.map((label, index) => (
          <li aria-current={index === step ? "step" : undefined} key={label}>
            <button
              className="flex w-full flex-col items-center gap-2 text-center text-xs"
              onClick={() => index < step && setStep(index)}
              type="button"
            >
              <span
                className={`flex size-8 items-center justify-center rounded-full border font-semibold ${index <= step ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
              >
                {index < step ? <Check aria-hidden="true" className="size-4" /> : index + 1}
              </span>
              <span className="hidden sm:block">{label}</span>
            </button>
          </li>
        ))}
      </ol>
      <Card>
        {step === 0 ? (
          <>
            <CardHeader>
              <CardTitle>Monitor basics</CardTitle>
              <CardDescription>
                Name the monitor and provide the public HTTP or HTTPS endpoint to check.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField id="monitor-name" label="Monitor name" required>
                <Input onChange={(event) => setName(event.target.value)} value={name} />
              </FormField>
              <FormField
                description="Private, loopback, link-local, metadata, credential-bearing, and restricted-port targets are rejected."
                id="monitor-endpoint"
                label="Endpoint URL"
                required
              >
                <Input
                  onChange={(event) => {
                    setEndpoint(event.target.value);
                    setTested(false);
                  }}
                  type="url"
                  value={endpoint}
                />
              </FormField>
              <InlineFeedback
                description="DevRelay re-resolves DNS and validates every redirect before connecting."
                title="Endpoint safety is enforced server-side"
                tone="info"
              />
            </CardContent>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <CardHeader>
              <CardTitle>Request behavior</CardTitle>
              <CardDescription>
                Use a constrained request that never stores response bodies or sensitive headers.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="method">HTTP method</Label>
                <Select defaultValue="GET">
                  <SelectTrigger className="mt-2 w-full" id="method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="HEAD">HEAD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <FormField
                description="Maximum time before the check fails."
                id="timeout"
                label="Timeout (ms)"
              >
                <Input defaultValue="5000" min="500" type="number" />
              </FormField>
              <FormField
                className="sm:col-span-2"
                description="Comma-separated ranges. Redirects are followed only after safety validation."
                id="status-codes"
                label="Accepted status codes"
              >
                <Input defaultValue="200-299" />
              </FormField>
            </CardContent>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <CardHeader>
              <CardTitle>Confirmation policy</CardTitle>
              <CardDescription>
                A plain-language policy prevents one noisy check from becoming a customer incident.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-3">
                <FormField id="interval" label="Interval (seconds)">
                  <Input defaultValue="60" min="60" type="number" />
                </FormField>
                <FormField id="failure-threshold" label="Failures to confirm">
                  <Input defaultValue="3" min="1" type="number" />
                </FormField>
                <FormField id="recovery-threshold" label="Successes to recover">
                  <Input defaultValue="3" min="1" type="number" />
                </FormField>
              </div>
              <div className="rounded-lg border bg-surface-subtle p-4 text-sm leading-6">
                <strong>Policy preview:</strong> Check every 60 seconds. Open an incident after 3
                consecutive failures. Resolve only after 3 consecutive successes.
              </div>
            </CardContent>
          </>
        ) : null}
        {step === 3 ? (
          <>
            <CardHeader>
              <CardTitle>Run a safe test</CardTitle>
              <CardDescription>
                Testing uses the same network policy and evidence redaction as scheduled checks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {tested ? (
                <InlineFeedback
                  description="HTTP 200 in 184 ms from the demo execution region. No response body was retained."
                  title="Endpoint is reachable"
                  tone="success"
                />
              ) : (
                <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
                  <FlaskConical aria-hidden="true" className="size-8 text-primary" />
                  <p className="mt-3 font-medium">Ready to test {endpoint}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The result becomes stale if the endpoint or policy changes.
                  </p>
                  <Button className="mt-5" onClick={() => setTested(true)}>
                    <FlaskConical aria-hidden="true" />
                    Run test check
                  </Button>
                </div>
              )}
            </CardContent>
          </>
        ) : null}
        {step === 4 ? (
          <>
            <CardHeader>
              <CardTitle>Review and activate</CardTitle>
              <CardDescription>
                Confirm the endpoint, evidence policy, and free-tier usage before scheduling checks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid gap-4 rounded-lg border bg-surface-subtle p-5 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Monitor</dt>
                  <dd className="mt-1 font-medium">{name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Endpoint</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{endpoint}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Schedule</dt>
                  <dd className="mt-1">Every 60 seconds</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Policy</dt>
                  <dd className="mt-1">3 failures / 3 successes</dd>
                </div>
              </dl>
              <InlineFeedback
                description="Activating this monitor uses the fourth of five demo monitor slots."
                title="Within free-tier limit"
                tone="warning"
              />
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
              disabled={step === 3 && !tested}
              onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}
            >
              Continue <ArrowRight aria-hidden="true" />
            </Button>
          ) : (
            <Button asChild>
              <Link href={`/app/${orgSlug}/services/${serviceId}`}>
                <ShieldCheck aria-hidden="true" />
                Activate monitor
              </Link>
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
