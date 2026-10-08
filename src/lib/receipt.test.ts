import { describe, expect, it } from "vitest";
import { receiptHtml, thermalReceiptText, type ReceiptData } from "./receipt";

const receipt = (overrides: Partial<ReceiptData["vente"]> = {}): ReceiptData => ({
  settings: {
    nom: "MG DELICES",
    telephone: "+226 00 00 00 00",
    adresse: "Ouagadougou",
    pied_ticket: "Merci et à bientôt",
    largeur_ticket: 80,
    show_restopro_branding: true,
  },
  vente: {
    numero: "MG-20261008-0115",
    created_at: "2026-10-08T12:00:00Z",
    type_commande: "sur_place",
    sous_total: 1200,
    remise: 0,
    total_final: 1200,
    montant_recu: 1500,
    montant_paye: 1200,
    reste_a_payer: 0,
    monnaie_rendue: 300,
    ...overrides,
  },
  caissier: "Awa",
  lignes: [
    { quantite: 1, nom_produit: "Coca-Cola", prix_unitaire: 700, total_ligne: 700 },
    { quantite: 1, nom_produit: "Eau", prix_unitaire: 500, total_ligne: 500 },
  ],
  paiements: [{ mode: "especes", montant: 1200 }],
});

describe("modèle commun du reçu", () => {
  it("affiche deux lignes historiques et le total de 1 200", () => {
    const html = receiptHtml(receipt());
    expect(html).toContain("Coca-Cola");
    expect(html).toContain("Eau");
    expect(html).toContain("700 F CFA");
    expect(html).toContain("500 F CFA");
    expect(html).toContain("1 200 F CFA");
  });

  it("affiche quantité, prix unitaire et total ligne pour une quantité supérieure à un", () => {
    const data = receipt();
    data.lignes = [{ quantite: 3, nom_produit: "Eau", prix_unitaire: 500, total_ligne: 1500 }];
    data.vente = { ...data.vente, sous_total: 1500, total_final: 1500, montant_paye: 1500, monnaie_rendue: 0 };
    const html = receiptHtml(data);
    expect(html).toContain("3 × 500 F CFA");
    expect(html).toContain("1 500 F CFA");
  });

  it("conserve sous-total, remise et total net enregistrés", () => {
    const html = receiptHtml(receipt({ sous_total: 1500, remise: 300, total_final: 1200 }));
    expect(html).toContain("Sous-total");
    expect(html).toContain("Remise");
    expect(html).toContain("300 F CFA");
    expect(html).toContain("TOTAL");
  });

  it("affiche la monnaie rendue lors d'un paiement supérieur au total", () => {
    expect(receiptHtml(receipt())).toContain("Monnaie rendue</span><b>300 F CFA");
  });

  it("affiche le reste d'une vente partiellement payée", () => {
    const html = receiptHtml(receipt({ montant_paye: 700, reste_a_payer: 500, monnaie_rendue: 0 }));
    expect(html).toContain("RESTE À PAYER");
    expect(html).toContain("500 F CFA");
  });

  it("ne dépend pas du prix catalogue courant", () => {
    const historical = receipt();
    const currentCatalogPrice = 900;
    expect(currentCatalogPrice).not.toBe(historical.lignes[0].prix_unitaire);
    expect(receiptHtml(historical)).toContain("1 × 700 F CFA");
    expect(receiptHtml(historical)).not.toContain("1 × 900 F CFA");
  });

  it("produit des formats thermiques distincts pour 58 et 80 mm", () => {
    const narrow = thermalReceiptText(receipt(), 58);
    const wide = thermalReceiptText(receipt(), 80);
    expect(narrow).toContain("-".repeat(32));
    expect(wide).toContain("-".repeat(48));
    expect(narrow).toContain("Coca-Cola");
    expect(wide).toContain("Monnaie rendue");
  });
});
