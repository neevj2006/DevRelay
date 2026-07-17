"use client";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { ResponsiveDataTable } from "@/components/responsive-data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export type ApiKeyRecord = {
  id: string;
  label: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};
export function ApiKeyConsole({
  initialKeys,
  orgSlug,
}: {
  initialKeys: ApiKeyRecord[];
  orgSlug: string;
}) {
  const [keys, setKeys] = useState(initialKeys);
  const [plaintext, setPlaintext] = useState("");
  const [message, setMessage] = useState("");
  async function create(formData: FormData) {
    const scopes = formData.getAll("scopes").map(String);
    const expires = String(formData.get("expiresAt") ?? "");
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/organizations/${orgSlug}/operations/api-keys`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: formData.get("label"),
          scopes,
          ...(expires ? { expiresAt: new Date(expires).toISOString() } : {}),
        }),
      },
    );
    if (!response.ok) {
      setMessage("API key could not be created.");
      return;
    }
    const created = await response.json();
    setPlaintext(created.plaintext);
    setKeys((items) => [
      {
        ...created,
        label: String(formData.get("label")),
        scopes,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        expiresAt: expires || null,
        revokedAt: null,
      },
      ...items,
    ]);
    setMessage("Copy this key now. It cannot be retrieved again.");
  }
  async function revoke(id: string) {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/organizations/${orgSlug}/operations/api-keys/${id}/revoke`,
      { method: "POST", credentials: "include" },
    );
    if (response.ok)
      setKeys((items) =>
        items.map((item) =>
          item.id === id ? { ...item, revokedAt: new Date().toISOString() } : item,
        ),
      );
  }
  return (
    <div className="space-y-8">
      <PageHeader
        title="API keys"
        description="Scoped automation credentials. Plaintext is displayed exactly once and usage is rate-limited."
      />
      <Card>
        <CardHeader>
          <CardTitle>Create API key</CardTitle>
          <CardDescription>Choose only the scopes the integration needs.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={create} className="space-y-4">
            <div>
              <Label htmlFor="key-label">Label</Label>
              <Input id="key-label" name="label" required />
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Scopes</legend>
              {["incidents:read", "incidents:write", "services:read", "analytics:read"].map(
                (scope) => (
                  <label className="mr-4 inline-flex items-center gap-2 text-sm" key={scope}>
                    <input name="scopes" type="checkbox" value={scope} />
                    {scope}
                  </label>
                ),
              )}
            </fieldset>
            <div>
              <Label htmlFor="key-expiry">Optional expiry</Label>
              <Input id="key-expiry" name="expiresAt" type="datetime-local" />
            </div>
            <Button type="submit">Create key</Button>
          </form>
          {plaintext && (
            <div className="mt-5 rounded border border-warning bg-muted p-4">
              <p className="mb-2 text-sm font-semibold">One-time plaintext</p>
              <code className="break-all text-xs">{plaintext}</code>
            </div>
          )}
          {message && (
            <p aria-live="polite" className="mt-4 text-sm">
              {message}
            </p>
          )}
        </CardContent>
      </Card>
      <ResponsiveDataTable
        caption="API keys; plaintext is never returned"
        columns={[
          { id: "label", header: "Label", cell: (r) => r.label },
          { id: "prefix", header: "Prefix", cell: (r) => <code>{r.prefix}…</code> },
          { id: "scopes", header: "Scopes", cell: (r) => r.scopes.join(", ") },
          {
            id: "expiry",
            header: "Expiry",
            cell: (r) => (r.expiresAt ? new Date(r.expiresAt).toISOString() : "Never"),
          },
          { id: "state", header: "State", cell: (r) => (r.revokedAt ? "Revoked" : "Active") },
          {
            id: "action",
            header: "Action",
            cell: (r) =>
              !r.revokedAt ? (
                <Button onClick={() => void revoke(r.id)} size="sm" variant="outline">
                  Revoke
                </Button>
              ) : null,
          },
        ]}
        getRowKey={(r) => r.id}
        rows={keys}
      />
    </div>
  );
}
