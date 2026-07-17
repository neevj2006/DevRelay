"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Preferences = {
  incidentNotifications: boolean;
  maintenanceNotifications: boolean;
  serviceIds: string[];
  services: { id: string; name: string }[];
};
export function SubscriberPreferencesForm({ token }: { token: string }) {
  const [data, setData] = useState<Preferences | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/subscriptions/preferences?token=${encodeURIComponent(token)}`,
    )
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setData(await r.json());
      })
      .catch(() => setMessage("This preferences link is invalid or expired."));
  }, [token]);
  if (!data)
    return (
      <p role={message ? "alert" : undefined} className="text-sm text-text-secondary">
        {message || "Loading preferences…"}
      </p>
    );
  async function submit(formData: FormData) {
    const serviceIds = formData.getAll("serviceIds").map(String);
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/subscriptions/preferences`,
      {
        body: JSON.stringify({
          incidentNotifications: formData.get("incidentNotifications") === "on",
          maintenanceNotifications: formData.get("maintenanceNotifications") === "on",
          serviceIds,
          token,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    setMessage(response.ok ? "Preferences saved." : "Preferences could not be saved.");
  }
  return (
    <form action={submit} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="font-medium">Update types</legend>
        <label className="flex gap-2 text-sm">
          <input
            defaultChecked={data.incidentNotifications}
            name="incidentNotifications"
            type="checkbox"
          />
          Incident updates
        </label>
        <label className="flex gap-2 text-sm">
          <input
            defaultChecked={data.maintenanceNotifications}
            name="maintenanceNotifications"
            type="checkbox"
          />
          Maintenance updates
        </label>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="font-medium">Services</legend>
        <p className="text-xs text-muted-foreground">
          Leave all unchecked to receive updates for every public service.
        </p>
        {data.services.map((service) => (
          <label className="flex gap-2 text-sm" key={service.id}>
            <input
              defaultChecked={data.serviceIds.includes(service.id)}
              name="serviceIds"
              type="checkbox"
              value={service.id}
            />
            {service.name}
          </label>
        ))}
      </fieldset>
      <Button type="submit">Save preferences</Button>
      {message ? (
        <p aria-live="polite" className="text-sm text-text-secondary">
          {message}
        </p>
      ) : null}
    </form>
  );
}
