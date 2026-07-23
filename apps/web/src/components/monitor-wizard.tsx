"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  FlaskConical,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("API health");
  const [monitorType, setMonitorType] = useState<"http" | "tls" | "dns">("http");
  const [endpoint, setEndpoint] = useState("https://1.1.1.1/");
  const [hostname, setHostname] = useState("example.com");
  const [dnsRecordType, setDnsRecordType] = useState<"A" | "AAAA" | "CNAME" | "MX" | "TXT">("A");
  const [expectedRecords, setExpectedRecords] = useState("93.184.216.34");
  const [expiryWarningDays, setExpiryWarningDays] = useState(30);
  const [method, setMethod] = useState<"GET" | "HEAD">("GET");
  const [timeout, setTimeoutValue] = useState(5000);
  const [statusCodes, setStatusCodes] = useState("200-299");
  const [interval, setIntervalValue] = useState(300);
  const [failureThreshold, setFailureThreshold] = useState(3);
  const [recoveryThreshold, setRecoveryThreshold] = useState(3);
  const [tested, setTested] = useState(false);
  const [monitorId, setMonitorId] = useState<string | null>(null);
  const [testSummary, setTestSummary] = useState("");
  const [busy, setBusy] = useState(false);

  function payload() {
    const ranges = statusCodes
      .split(",")
      .map((value) => value.trim())
      .map((value) => {
        const [from, to = from] = value.split("-").map(Number);
        return { from, to };
      });
    const policy = {
      failureImpact: "major_outage",
      failureThreshold,
      intervalSeconds: interval,
      recoveryThreshold,
      timeoutMilliseconds: timeout,
    };
    if (monitorType === "tls") {
      return {
        configuration: { endpointUrl: endpoint, expiryWarningDays, type: "tls" as const },
        name,
        policy,
        serviceId,
        type: "tls" as const,
      };
    }
    if (monitorType === "dns") {
      const records = expectedRecords
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const dnsRecords =
        dnsRecordType === "MX"
          ? records.map((value) => {
              const [priority, exchange] = value.split(/\s+/, 2);
              return { exchange, priority: Number(priority) };
            })
          : records;
      return {
        configuration: {
          expectedRecords: dnsRecords,
          hostname,
          recordType: dnsRecordType,
          type: "dns" as const,
        },
        name,
        policy,
        serviceId,
        type: "dns" as const,
      };
    }
    return {
      endpointUrl: endpoint,
      method,
      name,
      policy: {
        acceptedStatusCodes: ranges,
        requestHeaders: {},
        ...policy,
      },
      serviceId,
      type: "http" as const,
    };
  }

  async function runTest() {
    setBusy(true);
    try {
      const configuration = payload();
      const id =
        monitorId ??
        (await (async () => {
          const saveResponse = await fetch(`/api/backend/organizations/${orgSlug}/monitors`, {
            body: JSON.stringify(configuration),
            headers: { "content-type": "application/json" },
            method: "POST",
          });
          const saved = (await saveResponse.json().catch(() => null)) as {
            id?: string;
            message?: string;
          } | null;
          if (!saveResponse.ok || !saved?.id) {
            toast.error(saved?.message ?? "Monitor configuration could not be saved.");
            return null;
          }
          return saved.id;
        })());
      if (!id) return;
      setMonitorId(id);
      const response = await fetch(`/api/backend/organizations/${orgSlug}/monitors/${id}/test`, {
        method: "POST",
      });
      const evidence = (await response.json().catch(() => null)) as {
        durationMilliseconds?: number;
        httpStatusCode?: number;
        message?: string;
        ok?: boolean;
        summary?: string;
      } | null;
      if (!response.ok) {
        toast.error(evidence?.message ?? "The endpoint test was blocked or failed.");
        return;
      }
      setTestSummary(
        `${evidence?.summary ?? "Test completed"}${evidence?.durationMilliseconds ? ` in ${evidence.durationMilliseconds} ms` : ""}. Safe evidence only was retained.`,
      );
      setTested(Boolean(evidence?.ok));
      if (!evidence?.ok) toast.error("The endpoint did not satisfy the accepted status policy.");
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (!monitorId) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/backend/organizations/${orgSlug}/monitors/${monitorId}/activate`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        toast.error(body?.message ?? "The monitor could not be activated.");
        return;
      }
      toast.success("Monitor activated");
      router.push(`/app/${orgSlug}/services/${serviceId}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
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
                Select a monitor type before entering only its relevant safe configuration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField id="monitor-name" label="Monitor name" required>
                <Input
                  onChange={(event) => {
                    setName(event.target.value);
                    setTested(false);
                  }}
                  value={name}
                />
              </FormField>
              <div
                className="grid gap-3 sm:grid-cols-3"
                role="radiogroup"
                aria-label="Monitor type"
              >
                {(["http", "tls", "dns"] as const).map((type) => (
                  <Button
                    key={type}
                    aria-checked={monitorType === type}
                    onClick={() => {
                      setMonitorType(type);
                      setTested(false);
                    }}
                    role="radio"
                    type="button"
                    variant={monitorType === type ? "default" : "outline"}
                  >
                    {type === "http" ? "HTTP" : type === "tls" ? "TLS" : "DNS"}
                  </Button>
                ))}
              </div>
              {monitorType !== "dns" ? (
                <FormField
                  description="Private, loopback, link-local, metadata, credential-bearing, and restricted-port targets are rejected."
                  id="monitor-endpoint"
                  label={monitorType === "tls" ? "HTTPS endpoint" : "Endpoint URL"}
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
              ) : (
                <>
                  <FormField
                    description="DevRelay uses its configured recursive resolver; custom resolvers are not accepted."
                    id="monitor-hostname"
                    label="DNS hostname"
                    required
                  >
                    <Input
                      onChange={(event) => {
                        setHostname(event.target.value);
                        setTested(false);
                      }}
                      value={hostname}
                    />
                  </FormField>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="dns-record-type">Record type</Label>
                      <Select
                        onValueChange={(value) => {
                          setDnsRecordType(value as typeof dnsRecordType);
                          setTested(false);
                        }}
                        value={dnsRecordType}
                      >
                        <SelectTrigger className="mt-2 w-full" id="dns-record-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["A", "AAAA", "CNAME", "MX", "TXT"].map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <FormField
                      description={
                        dnsRecordType === "MX"
                          ? "Comma-separated priority and hostname pairs, for example: 10 mail.example.com."
                          : "Comma-separated exact expected records."
                      }
                      id="expected-records"
                      label="Expected records"
                      required
                    >
                      <Input
                        onChange={(event) => {
                          setExpectedRecords(event.target.value);
                          setTested(false);
                        }}
                        value={expectedRecords}
                      />
                    </FormField>
                  </div>
                </>
              )}
              <InlineFeedback
                description="DevRelay re-resolves DNS and validates every redirect before connecting."
                title={
                  monitorType === "dns"
                    ? "DNS evidence is bounded server-side"
                    : "Endpoint safety is enforced server-side"
                }
                tone="info"
              />
            </CardContent>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <CardHeader>
              <CardTitle>
                {monitorType === "http"
                  ? "Request behavior"
                  : `${monitorType.toUpperCase()} behavior`}
              </CardTitle>
              <CardDescription>
                Use a constrained request that never stores response bodies or sensitive headers.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              {monitorType === "http" ? (
                <div>
                  <Label htmlFor="method">HTTP method</Label>
                  <Select
                    onValueChange={(value) => {
                      setMethod(value as "GET" | "HEAD");
                      setTested(false);
                    }}
                    value={method}
                  >
                    <SelectTrigger className="mt-2 w-full" id="method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="HEAD">HEAD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <FormField
                description="Maximum time before the check fails."
                id="timeout"
                label="Timeout (ms)"
              >
                <Input
                  min="100"
                  onChange={(event) => {
                    setTimeoutValue(Number(event.target.value));
                    setTested(false);
                  }}
                  type="number"
                  value={timeout}
                />
              </FormField>
              {monitorType === "tls" ? (
                <FormField
                  description="A valid certificate inside this window produces a visible warning, not an incident."
                  id="expiry-warning"
                  label="Certificate expiry warning (days)"
                >
                  <Input
                    max="365"
                    min="1"
                    onChange={(event) => {
                      setExpiryWarningDays(Number(event.target.value));
                      setTested(false);
                    }}
                    type="number"
                    value={expiryWarningDays}
                  />
                </FormField>
              ) : null}
              {monitorType === "http" ? (
                <FormField
                  className="sm:col-span-2"
                  description="Comma-separated ranges. Redirects are followed only after safety validation."
                  id="status-codes"
                  label="Accepted status codes"
                >
                  <Input
                    onChange={(event) => {
                      setStatusCodes(event.target.value);
                      setTested(false);
                    }}
                    value={statusCodes}
                  />
                </FormField>
              ) : null}
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
                  <Input
                    min="10"
                    onChange={(event) => {
                      setIntervalValue(Number(event.target.value));
                      setTested(false);
                    }}
                    type="number"
                    value={interval}
                  />
                </FormField>
                <FormField id="failure-threshold" label="Failures to confirm">
                  <Input
                    max="10"
                    min="1"
                    onChange={(event) => {
                      setFailureThreshold(Number(event.target.value));
                      setTested(false);
                    }}
                    type="number"
                    value={failureThreshold}
                  />
                </FormField>
                <FormField id="recovery-threshold" label="Successes to recover">
                  <Input
                    max="10"
                    min="1"
                    onChange={(event) => {
                      setRecoveryThreshold(Number(event.target.value));
                      setTested(false);
                    }}
                    type="number"
                    value={recoveryThreshold}
                  />
                </FormField>
              </div>
              <div className="rounded-lg border bg-surface-subtle p-4 text-sm leading-6">
                <strong>Policy preview:</strong> Check every {interval} seconds with a {timeout} ms
                timeout.{" "}
                {monitorType === "http"
                  ? `Accept HTTP ${statusCodes}.`
                  : monitorType === "tls"
                    ? `Validate the certificate and warn within ${expiryWarningDays} days.`
                    : `Match the exact expected ${dnsRecordType} record set.`}{" "}
                Open an incident after {failureThreshold} consecutive failures. Resolve only after{" "}
                {recoveryThreshold} consecutive successes.
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
                  description={testSummary}
                  title="Endpoint is reachable"
                  tone="success"
                />
              ) : (
                <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
                  <FlaskConical aria-hidden="true" className="size-8 text-primary" />
                  <p className="mt-3 font-medium">
                    Ready to test {monitorType === "dns" ? hostname : endpoint}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The result becomes stale if the endpoint or policy changes.
                  </p>
                  <Button className="mt-5" disabled={busy} onClick={runTest}>
                    {busy ? (
                      <LoaderCircle aria-hidden="true" className="animate-spin" />
                    ) : (
                      <FlaskConical aria-hidden="true" />
                    )}
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
                  <dt className="text-xs text-text-secondary">Monitor</dt>
                  <dd className="mt-1 font-medium">{name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-secondary">
                    {monitorType === "dns" ? "Hostname" : "Endpoint"}
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs">
                    {monitorType === "dns" ? hostname : endpoint}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-secondary">Schedule</dt>
                  <dd className="mt-1">Every {interval} seconds</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-secondary">Policy</dt>
                  <dd className="mt-1">
                    {failureThreshold} failures / {recoveryThreshold} successes
                  </dd>
                </div>
              </dl>
              <InlineFeedback
                description="The API enforces the hosted limit of five active monitors and a five-minute minimum interval."
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
            <Button disabled={busy || !tested} onClick={activate}>
              {busy ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <ShieldCheck aria-hidden="true" />
              )}
              Activate monitor
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
