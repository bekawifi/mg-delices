import { describe, expect, it } from "vitest";
import { canManageTarget, hasRoleAccess, roleLabel } from "./users";

describe("permissions utilisateurs", () => {
  it("donne au super administrateur les acces historiques admin", () => {
    expect(hasRoleAccess("super_admin", ["admin"])).toBe(true);
    expect(hasRoleAccess("super_admin", ["gestionnaire"])).toBe(false);
  });

  it("reserve les comptes privilegies au super administrateur", () => {
    expect(canManageTarget("super_admin", "admin", "super_admin")).toBe(true);
    expect(canManageTarget("admin", "admin", "admin")).toBe(false);
    expect(canManageTarget("admin", "caissier", "super_admin")).toBe(false);
    expect(canManageTarget("admin", "caissier", "gestionnaire")).toBe(true);
  });

  it("affiche un libelle explicite", () => {
    expect(roleLabel("super_admin")).toBe("Super administrateur");
  });
});
