import { describe, expect, it } from "vitest";

import { organizationRoleValues, permissionsByRole } from "./tenancy.js";

describe("organization role permissions", () => {
  it("defines permissions for every persisted role", () => {
    expect(Object.keys(permissionsByRole)).toEqual(organizationRoleValues);
  });

  it("reserves organization management for owners", () => {
    expect(permissionsByRole.owner).toContain("organization:manage");
    expect(permissionsByRole.admin).not.toContain("organization:manage");
    expect(permissionsByRole.member).not.toContain("organization:manage");
  });
});
