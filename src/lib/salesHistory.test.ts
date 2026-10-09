import { describe, expect, it } from "vitest";
import {
  primaryPaymentLabel,
  salePaymentStatusClass,
  salePaymentStatusLabel,
} from "./salesHistory";

describe("historique des ventes", () => {
  it("présente les statuts de paiement sans dépendre uniquement de la couleur", () => {
    expect(salePaymentStatusLabel("payee")).toBe("Payée");
    expect(salePaymentStatusLabel("partiellement_payee")).toBe("Partiellement payée");
    expect(salePaymentStatusLabel("impayee")).toBe("Impayée");
    expect(salePaymentStatusClass("payee")).toContain("emerald");
  });

  it("présente le mode de paiement principal", () => {
    expect(primaryPaymentLabel("especes")).toBe("Espèces");
    expect(primaryPaymentLabel(null)).toBe("Aucun paiement");
  });
});
