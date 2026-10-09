import { describe, expect, it } from "vitest";
import {
  EMPTY_CUSTOMER_FORM,
  customerSavePayload,
  moveCustomerOption,
} from "./customers";

describe("création client partagée", () => {
  it("utilise le même payload save_customer avec un plafond initial nul", () => {
    expect(
      customerSavePayload({
        ...EMPTY_CUSTOMER_FORM,
        nom: "Awa Test",
        telephone: "700000000",
        email: "awa@example.test",
      }),
    ).toEqual({
      p_id: null,
      p_nom: "Awa Test",
      p_telephone: "700000000",
      p_email: "awa@example.test",
      p_adresse: null,
      p_plafond_credit: 0,
      p_actif: true,
    });
  });

  it("gère la navigation clavier circulaire", () => {
    expect(moveCustomerOption(-1, "ArrowDown", 3)).toBe(0);
    expect(moveCustomerOption(2, "ArrowDown", 3)).toBe(0);
    expect(moveCustomerOption(0, "ArrowUp", 3)).toBe(2);
    expect(moveCustomerOption(0, "ArrowDown", 0)).toBe(-1);
  });
});
