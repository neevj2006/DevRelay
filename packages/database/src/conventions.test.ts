import { getTableConfig, pgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  auditTimestamps,
  primaryKeyColumn,
  softDeleteColumn,
  tenantOrganizationColumn,
} from "./conventions.js";

const conventionProbe = pgTable("convention_probe", {
  id: primaryKeyColumn(),
  organizationId: tenantOrganizationColumn(),
  ...auditTimestamps(),
  deletedAt: softDeleteColumn(),
});

describe("database column conventions", () => {
  const columns = getTableConfig(conventionProbe).columns;
  const column = (name: string) => {
    const match = columns.find((candidate) => candidate.name === name);
    if (match === undefined) {
      throw new Error(`Missing convention probe column: ${name}`);
    }
    return match;
  };

  it("uses generated UUID primary keys and explicit tenant ownership", () => {
    expect(column("id")).toMatchObject({
      hasDefault: true,
      notNull: true,
      primary: true,
    });
    expect(column("organization_id")).toMatchObject({
      hasDefault: false,
      notNull: true,
      primary: false,
    });
  });

  it("uses millisecond timezone-aware audit and deletion timestamps", () => {
    expect(column("created_at").getSQLType()).toBe("timestamp (3) with time zone");
    expect(column("updated_at").getSQLType()).toBe("timestamp (3) with time zone");
    expect(column("deleted_at").getSQLType()).toBe("timestamp (3) with time zone");
    expect(column("created_at")).toMatchObject({ hasDefault: true, notNull: true });
    expect(column("deleted_at")).toMatchObject({ hasDefault: false, notNull: false });
  });
});
