import { timestamp, uuid } from "drizzle-orm/pg-core";

const timestampConfiguration = {
  mode: "date",
  precision: 3,
  withTimezone: true,
} as const;

export function primaryKeyColumn(name = "id") {
  return uuid(name).defaultRandom().primaryKey();
}

export function tenantOrganizationColumn(name = "organization_id") {
  return uuid(name).notNull();
}

export function auditTimestamps() {
  return {
    createdAt: timestamp("created_at", timestampConfiguration).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", timestampConfiguration).defaultNow().notNull(),
  };
}

export function softDeleteColumn(name = "deleted_at") {
  return timestamp(name, timestampConfiguration);
}
