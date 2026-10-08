import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SalesHistoryList } from "./SalesHistoryPage";
import type { SaleHistoryRow } from "../lib/salesHistory";

const sale: SaleHistoryRow = {
  id: "sale-1",
  numero: "MG-20261008-0115",
  created_at: "2026-10-08T17:46:25Z",
  type_commande: "sur_place",
  total_final: 1200,
  montant_paye: 1200,
  reste_a_payer: 0,
  statut_paiement: "payee",
  client: "Vente anonyme",
  caissier: "Administrateur MG DELICES",
  mode_paiement: "especes",
};

describe("liste d'historique des ventes", () => {
  it("affiche la vente réelle et ses actions sans charger tout l'historique", () => {
    const html = renderToStaticMarkup(
      <SalesHistoryList sales={[sale]} onView={vi.fn()} onPrint={vi.fn()} />,
    );
    expect(html).toContain("MG-20261008-0115");
    expect(html).toContain("Vente anonyme");
    expect(html).toContain("Administrateur MG DELICES");
    expect(html).toContain("1 200 F CFA");
    expect(html).toContain("Espèces");
    expect(html).toContain("Payée");
    expect(html).toContain("Voir le reçu");
    expect(html).toContain("Réimprimer");
  });
});
