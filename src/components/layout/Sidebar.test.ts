import { describe, expect, it } from "vitest";
import { navigationLinks } from "./Sidebar";
describe("permissions menus", () => {
  it("reserve les rapports aux gestionnaires", () => {
    const roles = navigationLinks.find((link) => link.to === "/rapports")?.roles;
    expect(roles).toEqual(["admin", "gestionnaire"]);
    expect(roles).not.toContain("serveur");
    expect(roles).not.toContain("cuisine");
  });
  it("reserve audit et diagnostic a admin", () => {
    for (const path of ["/admin/utilisateurs", "/admin/audit", "/admin/diagnostic"])
      expect(navigationLinks.find((link) => link.to === path)?.roles).toEqual(["admin"]);
  });
  it("propose le profil a tous les roles", () => {
    expect(navigationLinks.find((link) => link.to === "/profil")?.roles).toEqual([
      "super_admin", "admin", "gestionnaire", "caissier", "serveur", "cuisine",
    ]);
  });
});
describe("historique des ventes", () => {
  it("est accessible aux rôles de caisse uniquement", () => {
    expect(navigationLinks.find((link) => link.to === "/caisse/historique")?.roles).toEqual([
      "admin",
      "gestionnaire",
      "caissier",
    ]);
  });
});
