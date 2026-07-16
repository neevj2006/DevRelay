import {
  Activity,
  BellRing,
  ChartNoAxesCombined,
  ClipboardList,
  Gauge,
  type LucideIcon,
  RadioTower,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";

export type OrganizationRole = "owner" | "admin" | "member";

export type NavigationItem = {
  label: string;
  segment: string;
  icon: LucideIcon;
  roles: ReadonlyArray<OrganizationRole>;
};

export type NavigationGroup = {
  label?: string;
  items: ReadonlyArray<NavigationItem>;
};

const allRoles = ["owner", "admin", "member"] as const;
const administrativeRoles = ["owner", "admin"] as const;

export const applicationNavigation: ReadonlyArray<NavigationGroup> = [
  {
    items: [
      { label: "Overview", segment: "", icon: Gauge, roles: allRoles },
      { label: "Services", segment: "/services", icon: RadioTower, roles: allRoles },
      { label: "Incidents", segment: "/incidents", icon: Activity, roles: allRoles },
      { label: "Maintenance", segment: "/maintenance", icon: Wrench, roles: allRoles },
      { label: "Analytics", segment: "/analytics", icon: ChartNoAxesCombined, roles: allRoles },
    ],
  },
  {
    label: "Communications",
    items: [
      { label: "Subscribers", segment: "/subscribers", icon: BellRing, roles: allRoles },
      {
        label: "Delivery history",
        segment: "/subscribers/deliveries",
        icon: ClipboardList,
        roles: allRoles,
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "System health",
        segment: "/operations/health",
        icon: ShieldCheck,
        roles: administrativeRoles,
      },
    ],
  },
  {
    label: "Organization",
    items: [
      { label: "Members & roles", segment: "/members", icon: Users, roles: administrativeRoles },
      { label: "Audit log", segment: "/audit", icon: ScrollText, roles: administrativeRoles },
      { label: "Settings", segment: "/settings", icon: Settings, roles: administrativeRoles },
    ],
  },
];

export function navigationForRole(role: OrganizationRole) {
  return applicationNavigation
    .map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes(role)) }))
    .filter((group) => group.items.length > 0);
}
