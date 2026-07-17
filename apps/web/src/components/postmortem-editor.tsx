"use client";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
export type PostmortemData = {
  status: string;
  summary: string | null;
  impact: string | null;
  timeline: string | null;
  root_cause: string | null;
  resolution: string | null;
  action_items: { description: string; owner?: string }[];
};
export function PostmortemEditor({
  initial,
  incidentId,
  orgSlug,
}: {
  initial: PostmortemData | null;
  incidentId: string;
  orgSlug: string;
}) {
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [message, setMessage] = useState("");
  async function save(formData: FormData) {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/organizations/${orgSlug}/operations/incidents/${incidentId}/postmortem`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: formData.get("summary"),
          impact: formData.get("impact"),
          timeline: formData.get("timeline"),
          rootCause: formData.get("rootCause"),
          resolution: formData.get("resolution"),
          actionItems: String(formData.get("actionItem") ?? "").trim()
            ? [
                {
                  description: formData.get("actionItem"),
                  owner: String(formData.get("owner") ?? "") || undefined,
                },
              ]
            : [],
        }),
      },
    );
    setMessage(
      response.ok
        ? "Private draft saved."
        : "Draft could not be saved. The incident must be resolved.",
    );
  }
  async function publish() {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/organizations/${orgSlug}/operations/incidents/${incidentId}/postmortem/publish`,
      { method: "POST", credentials: "include" },
    );
    if (response.ok) {
      setStatus("published");
      setMessage("Postmortem published publicly.");
    } else setMessage("Save every required section before publishing.");
  }
  return (
    <div className="space-y-8">
      <PageHeader
        title="Postmortem"
        description="Drafts remain private until an administrator publishes the complete record."
      />
      <Card>
        <CardHeader>
          <CardTitle>{status === "published" ? "Published postmortem" : "Private draft"}</CardTitle>
          <CardDescription>
            Summary, impact, timeline, root cause, resolution, and actions are required for
            publication.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={save} className="space-y-4">
            {[
              ["summary", "Summary", initial?.summary],
              ["impact", "Impact", initial?.impact],
              ["timeline", "Timeline", initial?.timeline],
              ["rootCause", "Root cause", initial?.root_cause],
              ["resolution", "Resolution", initial?.resolution],
            ].map(([name, label, value]) => (
              <div key={String(name)}>
                <Label htmlFor={`postmortem-${String(name)}`}>{String(label)}</Label>
                <Textarea
                  defaultValue={String(value ?? "")}
                  disabled={status === "published"}
                  id={`postmortem-${String(name)}`}
                  name={String(name)}
                  required
                />
              </div>
            ))}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="action-item">Action item</Label>
                <Input
                  defaultValue={initial?.action_items[0]?.description}
                  disabled={status === "published"}
                  id="action-item"
                  name="actionItem"
                />
              </div>
              <div>
                <Label htmlFor="action-owner">Owner</Label>
                <Input
                  defaultValue={initial?.action_items[0]?.owner}
                  disabled={status === "published"}
                  id="action-owner"
                  name="owner"
                />
              </div>
            </div>
            {status !== "published" && (
              <div className="flex gap-3">
                <Button type="submit">Save private draft</Button>
                <Button onClick={() => void publish()} type="button" variant="outline">
                  Publish
                </Button>
              </div>
            )}
          </form>
          {message && (
            <p aria-live="polite" className="mt-4 text-sm">
              {message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
