"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export function ServiceForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isPublic, setIsPublic] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function save(createMonitor: boolean) {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/backend/organizations/${orgSlug}/services`, {
        body: JSON.stringify({
          displayOrder,
          isPublic,
          name,
          ...(description.trim() ? { publicDescription: description } : {}),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        id?: string;
        message?: string;
      } | null;
      if (!response.ok || !body?.id) {
        toast.error(body?.message ?? "The service could not be created.");
        return;
      }
      toast.success("Service created");
      router.push(
        createMonitor
          ? `/app/${orgSlug}/services/${body.id}/monitors/new`
          : `/app/${orgSlug}/services/${body.id}`,
      );
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Service details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <FormField id="service-name" label="Service name" required>
          <Input maxLength={120} onChange={(event) => setName(event.target.value)} value={name} />
        </FormField>
        <FormField
          description="Shown to customers when this service is on a public status page."
          id="public-description"
          label="Public description"
        >
          <Textarea
            maxLength={1000}
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </FormField>
        <FormField
          description="Lower numbers appear first."
          id="display-order"
          label="Display order"
        >
          <Input
            min={0}
            onChange={(event) => setDisplayOrder(Number(event.target.value))}
            type="number"
            value={displayOrder}
          />
        </FormField>
        <div className="flex items-start justify-between gap-4 rounded-lg border bg-surface-subtle p-4">
          <div>
            <Label htmlFor="service-public">Public service</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Allow this service to appear on a configured status page.
            </p>
          </div>
          <Switch checked={isPublic} id="service-public" onCheckedChange={setIsPublic} />
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap justify-end gap-3 border-t pt-5">
        <Button disabled={!name.trim() || submitting} onClick={() => save(false)} variant="outline">
          {submitting ? <LoaderCircle className="animate-spin" /> : <Save />}Save
        </Button>
        <Button disabled={!name.trim() || submitting} onClick={() => save(true)}>
          Save and create monitor
        </Button>
      </CardFooter>
    </Card>
  );
}
