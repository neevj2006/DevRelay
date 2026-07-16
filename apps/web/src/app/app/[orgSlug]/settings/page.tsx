import { Save, ShieldAlert } from "lucide-react";

import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        description="Organization identity, public status defaults, retention, and destructive controls."
        title="Organization settings"
      />
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="status">Public status</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
          <TabsTrigger value="danger">Danger zone</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-6" value="general">
          <Card>
            <CardHeader>
              <CardTitle>Organization identity</CardTitle>
              <CardDescription>
                Used in the workspace and customer-facing communication.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField id="organization-name" label="Organization name">
                <Input defaultValue="Acme Cloud" />
              </FormField>
              <FormField
                description="Changing the slug updates authenticated workspace links."
                id="organization-slug"
                label="Organization slug"
              >
                <Input defaultValue="acme" />
              </FormField>
            </CardContent>
            <CardFooter className="justify-end border-t pt-5">
              <Button>
                <Save aria-hidden="true" />
                Save changes
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent className="mt-6" value="status">
          <Card>
            <CardHeader>
              <CardTitle>Public status defaults</CardTitle>
              <CardDescription>
                Control customer-facing identity and subscription behavior.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <FormField id="status-title" label="Status page title">
                <Input defaultValue="Acme Cloud status" />
              </FormField>
              <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                <div>
                  <Label htmlFor="subscriptions">Allow subscriptions</Label>
                  <p className="mt-1 text-sm text-text-secondary">
                    Visitors can verify an email destination and select services.
                  </p>
                </div>
                <Switch defaultChecked id="subscriptions" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent className="mt-6" value="retention">
          <Card>
            <CardHeader>
              <CardTitle>Evidence retention</CardTitle>
              <CardDescription>Free-demo retention remains bounded and documented.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-sm text-muted-foreground">Raw checks</dt>
                  <dd className="mt-1 font-medium">30 days</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Hourly rollups</dt>
                  <dd className="mt-1 font-medium">12 months</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Audit events</dt>
                  <dd className="mt-1 font-medium">12 months</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent className="mt-6" value="danger">
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <ShieldAlert aria-hidden="true" className="size-5" />
                Danger zone
              </CardTitle>
              <CardDescription>
                Deleting an organization is blocked while historical incidents or the sole owner
                require protection.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive">Delete organization</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
