import { MoreHorizontal, Plus, Shield, UserRound } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ResponsiveDataTable } from "@/components/responsive-data-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const members = [
  {
    id: "neev",
    name: "Neev A.",
    email: "neev@example.com",
    initials: "NA",
    role: "Owner",
    joined: "Project creator",
  },
  {
    id: "maya",
    name: "Maya R.",
    email: "maya@example.com",
    initials: "MR",
    role: "Admin",
    joined: "Joined Jul 10",
  },
  {
    id: "sam",
    name: "Sam K.",
    email: "sam@example.com",
    initials: "SK",
    role: "Member",
    joined: "Joined Jul 12",
  },
];

export default function MembersPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <Button>
            <Plus aria-hidden="true" />
            Invite member
          </Button>
        }
        description="Organization access, roles, invitations, and ownership safeguards."
        title="Members & roles"
      />
      <div className="rounded-lg border bg-brand-soft p-4 text-sm text-brand-soft-foreground">
        <p className="flex items-center gap-2 font-semibold">
          <Shield aria-hidden="true" className="size-4" />
          Ownership is protected
        </p>
        <p className="mt-1">
          The only owner cannot leave or be removed until ownership is transferred.
        </p>
      </div>
      <ResponsiveDataTable
        caption="Organization members"
        columns={[
          {
            id: "member",
            header: "Member",
            cell: (row) => (
              <div className="flex items-center gap-3">
                <Avatar className="size-8">
                  <AvatarFallback>{row.initials}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.email}</p>
                </div>
              </div>
            ),
          },
          {
            id: "role",
            header: "Role",
            cell: (row) => (
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold">
                <UserRound aria-hidden="true" className="size-3.5" />
                {row.role}
              </span>
            ),
          },
          { id: "joined", header: "Membership", cell: (row) => row.joined },
          {
            id: "actions",
            header: "",
            cell: () => (
              <Button aria-label="Member actions" size="icon-sm" variant="ghost">
                <MoreHorizontal aria-hidden="true" />
              </Button>
            ),
          },
        ]}
        getRowKey={(row) => row.id}
        rows={members}
      />
    </div>
  );
}
