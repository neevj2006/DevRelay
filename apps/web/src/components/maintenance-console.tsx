"use client";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type MaintenanceWindow = {
  id: string;
  title: string;
  publicDescription: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  notifySubscribers: boolean;
  services: { id: string; name: string }[];
};
export function MaintenanceConsole({
  initialWindows,
  orgSlug,
  readOnly = false,
  services,
}: {
  initialWindows: MaintenanceWindow[];
  orgSlug: string;
  readOnly?: boolean;
  services: { id: string; name: string }[];
}) {
  const [windows, setWindows] = useState(initialWindows);
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    const serviceIds = formData.getAll("serviceIds").map(String);
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/organizations/${orgSlug}/operations/maintenance`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.get("title"),
          publicDescription: formData.get("publicDescription"),
          startsAt: new Date(String(formData.get("startsAt"))).toISOString(),
          endsAt: new Date(String(formData.get("endsAt"))).toISOString(),
          serviceIds,
          notifySubscribers: formData.get("notifySubscribers") === "on",
        }),
      },
    );
    if (!response.ok) {
      setMessage("Maintenance could not be scheduled. Check the times and affected services.");
      return;
    }
    location.reload();
  }
  async function cancel(id: string) {
    const reason = window.prompt("Why is this maintenance being cancelled?");
    if (!reason) return;
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/organizations/${orgSlug}/operations/maintenance/${id}/cancel`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      },
    );
    if (response.ok) {
      setWindows((items) =>
        items.map((item) => (item.id === id ? { ...item, status: "cancelled" } : item)),
      );
      setMessage("Maintenance cancelled.");
    } else setMessage("Maintenance could not be cancelled.");
  }
  async function edit(item: MaintenanceWindow) {
    const title = window.prompt("Maintenance title", item.title);
    if (!title) return;
    const description = window.prompt(
      "Public description",
      item.publicDescription ?? "Scheduled maintenance",
    );
    if (!description) return;
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/organizations/${orgSlug}/operations/maintenance/${item.id}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          publicDescription: description,
          startsAt: new Date(item.startsAt).toISOString(),
          endsAt: new Date(item.endsAt).toISOString(),
          serviceIds: item.services.map((service) => service.id),
          notifySubscribers: item.notifySubscribers,
        }),
      },
    );
    if (response.ok) {
      setWindows((items) =>
        items.map((window) =>
          window.id === item.id ? { ...window, title, publicDescription: description } : window,
        ),
      );
      setMessage("Maintenance updated.");
    } else setMessage("Maintenance could not be updated.");
  }
  return (
    <div className="space-y-8">
      <PageHeader
        title="Maintenance"
        description="Plan customer-visible work; active windows override the displayed state while raw evidence continues."
      />
      {!readOnly ? (
        <Card>
          <CardHeader>
            <CardTitle>Schedule maintenance</CardTitle>
            <CardDescription>
              All dates are stored and displayed in UTC. End time must be after start time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={submit} className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="maintenance-title">Title</Label>
                <Input id="maintenance-title" name="title" required />
              </div>
              <div>
                <Label htmlFor="maintenance-description">Public description</Label>
                <Textarea id="maintenance-description" name="publicDescription" required />
              </div>
              <div>
                <Label htmlFor="maintenance-start">Starts (local input)</Label>
                <Input id="maintenance-start" name="startsAt" type="datetime-local" required />
              </div>
              <div>
                <Label htmlFor="maintenance-end">Ends (local input)</Label>
                <Input id="maintenance-end" name="endsAt" type="datetime-local" required />
              </div>
              <fieldset className="md:col-span-2">
                <legend className="mb-2 text-sm font-medium">Affected services</legend>
                <div className="flex flex-wrap gap-4">
                  {services.map((service) => (
                    <label className="flex items-center gap-2 text-sm" key={service.id}>
                      <input name="serviceIds" type="checkbox" value={service.id} />
                      {service.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-2 text-sm">
                <input name="notifySubscribers" type="checkbox" />
                Notify opted-in subscribers
              </label>
              <div className="md:col-span-2">
                <Button type="submit">Schedule maintenance</Button>
              </div>
            </form>
            {message && (
              <p aria-live="polite" className="mt-4 text-sm">
                {message}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
      <section aria-labelledby="maintenance-list">
        <h2 className="mb-4 text-xl font-semibold" id="maintenance-list">
          Scheduled and past windows
        </h2>
        <div className="space-y-4">
          {windows.length ? (
            windows.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <CardTitle>{item.title}</CardTitle>
                      <CardDescription>
                        {new Date(item.startsAt).toISOString().replace("T", " ").slice(0, 16)} -{" "}
                        {new Date(item.endsAt).toISOString().replace("T", " ").slice(0, 16)} UTC ·{" "}
                        {item.status}
                      </CardDescription>
                    </div>
                    {!readOnly && item.status === "scheduled" && (
                      <div className="flex gap-2">
                        <Button onClick={() => void edit(item)} variant="outline">
                          Edit
                        </Button>
                        <Button onClick={() => void cancel(item.id)} variant="outline">
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-text-secondary">{item.publicDescription}</p>
                  <p className="mt-3 text-xs">
                    Services: {item.services.map((service) => service.name).join(", ")}
                  </p>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                No maintenance windows yet.
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
