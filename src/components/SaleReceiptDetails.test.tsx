import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SaleReceiptDetails } from "./SaleReceiptDetails";
import type { ReceiptData } from "../lib/receipt";

describe("écran de confirmation détaillé", () => {
  it("affiche les lignes, les métadonnées et les montants du reçu commun", () => {
    const receipt: ReceiptData = {
      settings: { nom: "MG DELICES", pied_ticket: "Merci", largeur_ticket: 80 },
      vente: {
        numero: "MG-20261008-0115",
        created_at: "2026-10-08T12:00:00Z",
        type_commande: "sur_place",
        sous_total: 1200,
        remise: 0,
        total_final: 1200,
        montant_paye: 1200,
        reste_a_payer: 0,
        monnaie_rendue: 300,
      },
      caissier: "Awa",
      client: "Client test",
      lignes: [
        { quantite: 1, nom_produit: "Coca-Cola", prix_unitaire: 700, total_ligne: 700 },
        { quantite: 1, nom_produit: "Eau", prix_unitaire: 500, total_ligne: 500 },
      ],
      paiements: [
        { mode: "especes", montant: 700 },
        { mode: "orange_money", montant: 500, reference: "OM-123" },
      ],
    };
    const html = renderToStaticMarkup(<SaleReceiptDetails receipt={receipt} />);
    expect(html).toContain("Coca-Cola");
    expect(html).toContain("Eau");
    expect(html).toContain("Client test");
    expect(html).toContain("Sur place");
    expect(html).toContain("Espèces");
    expect(html).toContain("Paiements");
    expect(html).toContain("Orange Money");
    expect(html).toContain("OM-123");
    expect(html).toContain("Monnaie rendue");
  });
});
