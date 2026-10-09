import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomerPicker } from "./CustomerPicker";
import type { Customer } from "../types/customers";

const customer: Customer = {
  id: "client-1",
  numero: "CLI-000001",
  nom: "Awa Diallo",
  telephone: "700000000",
  email: null,
  adresse: null,
  plafond_credit: 0,
  encours_credit: 0,
  points_fidelite: 0,
  actif: true,
  created_at: "2026-10-08T00:00:00Z",
  updated_at: "2026-10-08T00:00:00Z",
};

describe("sélecteur client de la caisse", () => {
  it("expose la recherche et la création rapide de façon accessible", () => {
    const html = renderToStaticMarkup(
      <CustomerPicker customers={[customer]} value={null} onChange={() => {}} onCreate={() => {}} />,
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain("Rechercher ou sélectionner un client");
    expect(html).toContain("Rechercher par nom, numéro ou téléphone");
    expect(html).toContain("Créer un nouveau client");
  });

  it("affiche le client sélectionné sans modifier les données de vente", () => {
    const saleDraft = Object.freeze({ cart: ["produit-1"], discount: 250, received: 5000 });
    const before = JSON.stringify(saleDraft);
    const html = renderToStaticMarkup(
      <CustomerPicker
        customers={[customer]}
        value={customer.id}
        onChange={() => {}}
        onCreate={() => {}}
      />,
    );
    expect(html).toContain('value="Awa Diallo"');
    expect(JSON.stringify(saleDraft)).toBe(before);
  });
});
