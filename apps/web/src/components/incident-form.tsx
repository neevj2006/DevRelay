"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function IncidentForm({
  orgSlug,
  services,
}: {
  orgSlug: string;
  services: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [severity, setSeverity] = useState("major_outage");
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/backend/organizations/${orgSlug}/incidents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          affectedServiceIds: selected,
          idempotencyKey: crypto.randomUUID(),
          initialLifecycle: "investigating",
          privateSummary: summary,
          severity,
          title,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        id?: string;
        message?: string;
      } | null;
      if (!response.ok || !body?.id)
        return toast.error(body?.message ?? "The incident could not be created.");
      toast.success("Incident created");
      router.push(`/app/${orgSlug}/incidents/${body.id}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Incident details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <FormField id="incident-title" label="Internal incident title" required>
          <Input
            id="incident-title"
            maxLength={240}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </FormField>
        <FormField id="incident-summary" label="Initial private summary" required>
          <Textarea
            id="incident-summary"
            maxLength={5000}
            onChange={(event) => setSummary(event.target.value)}
            value={summary}
          />
        </FormField>
        <FormField id="incident-severity" label="Severity">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            id="incident-severity"
            onChange={(event) => setSeverity(event.target.value)}
            value={severity}
          >
            <option value="degraded_performance">Degraded performance</option>
            <option value="partial_outage">Partial outage</option>
            <option value="major_outage">Major outage</option>
          </select>
        </FormField>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Affected services</legend>
          <div className="space-y-2">
            {services.map((service) => (
              <Label
                className="flex min-h-11 items-center gap-3 rounded-lg border p-3"
                key={service.id}
              >
                <input
                  checked={selected.includes(service.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, service.id]
                        : current.filter((id) => id !== service.id),
                    )
                  }
                  type="checkbox"
                />
                {service.name}
              </Label>
            ))}
          </div>
        </fieldset>
      </CardContent>
      <CardFooter className="justify-end border-t pt-5">
        <Button
          disabled={submitting || !title.trim() || !summary.trim() || selected.length === 0}
          onClick={submit}
        >
          {submitting ? <LoaderCircle className="animate-spin" /> : null}Create incident
        </Button>
      </CardFooter>
    </Card>
  );
}
