import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PRINT_PREFERENCES,
  loadPrintPreferences,
  printerErrorMessage,
  printReceiptData,
  reprintReceiptData,
  savePrintPreferences,
  type PrintTransport,
} from "./printer";
import type { ReceiptData } from "./receipt";

it("conserve le message exact d'une erreur d'imprimante", () => {
  expect(printerErrorMessage(new Error("Imprimante absente ou hors ligne."))).toBe(
    "Imprimante absente ou hors ligne.",
  );
});

const sample: ReceiptData = {
  settings: { nom: "Chez Awa", pied_ticket: "Merci", largeur_ticket: 80 },
  vente: {
    numero: "V-1",
    created_at: "2026-10-08T12:00:00Z",
    type_commande: "emporter",
    sous_total: 1000,
    remise: 0,
    total_final: 1000,
    montant_paye: 1000,
    reste_a_payer: 0,
    monnaie_rendue: 0,
  },
  caissier: "Awa",
  lignes: [{ quantite: 1, nom_produit: "Plat", prix_unitaire: 1000, total_ligne: 1000 }],
  paiements: [{ mode: "especes", montant: 1000 }],
};

const transport = (): PrintTransport => ({
  listPrinters: vi.fn(async () => ["Thermal 80"]),
  silentPrint: vi.fn(async () => undefined),
  dialogPrint: vi.fn(async () => true),
});

describe("préférences d'impression", () => {
  it("normalise largeur et copies locales", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    savePrintPreferences(
      { silent: true, printerName: " Thermal 80 ", widthMm: 58, copies: 9, autoPrint: true },
      storage,
    );
    expect(loadPrintPreferences(storage)).toEqual({
      silent: true,
      printerName: "Thermal 80",
      widthMm: 58,
      copies: 5,
      autoPrint: true,
    });
  });

  it("conserve le mode avec dialogue lorsque le silencieux est désactivé", async () => {
    const target = transport();
    await expect(printReceiptData(sample, DEFAULT_PRINT_PREFERENCES, target)).resolves.toBe(
      "dialog",
    );
    expect(target.dialogPrint).toHaveBeenCalledOnce();
    expect(target.silentPrint).not.toHaveBeenCalled();
  });

  it("n'utilise aucune popup en mode silencieux et appelle uniquement le natif", async () => {
    const open = vi.fn();
    const print = vi.fn();
    vi.stubGlobal("window", { open, print });
    const target = transport();
    await expect(
      printReceiptData(
        sample,
        { silent: true, printerName: "Thermal 80", widthMm: 58, copies: 2, autoPrint: false },
        target,
      ),
    ).resolves.toBe("silent");
    expect(target.silentPrint).toHaveBeenCalledOnce();
    expect(target.dialogPrint).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("utilise le dialogue natif, sans popup, lorsque le silencieux est désactivé", async () => {
    const open = vi.fn();
    const print = vi.fn();
    vi.stubGlobal("window", { open, print });
    const target = transport();
    await expect(printReceiptData(sample, DEFAULT_PRINT_PREFERENCES, target)).resolves.toBe(
      "dialog",
    );
    expect(target.dialogPrint).toHaveBeenCalledWith(
      expect.objectContaining({ copies: 1, widthMm: 80 }),
    );
    expect(open).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("signale explicitement l'annulation du dialogue Windows", async () => {
    const target = transport();
    target.dialogPrint = vi.fn(async () => false);
    await expect(printReceiptData(sample, DEFAULT_PRINT_PREFERENCES, target)).resolves.toBe(
      "cancelled",
    );
  });

  it("refuse explicitement une imprimante silencieuse absente", async () => {
    const target = transport();
    target.listPrinters = vi.fn(async () => []);
    await expect(
      printReceiptData(
        sample,
        { silent: true, printerName: "Thermal 80", widthMm: 80, copies: 1, autoPrint: false },
        target,
      ),
    ).rejects.toThrow("absente ou indisponible");
    expect(target.silentPrint).not.toHaveBeenCalled();
  });

  it("réessaie le même reçu historique sans opération de vente", async () => {
    const target = transport();
    const native = vi
      .fn()
      .mockRejectedValueOnce(new Error("hors ligne"))
      .mockResolvedValueOnce(undefined);
    target.silentPrint = native;
    const preferences = {
      silent: true,
      printerName: "Thermal 80",
      widthMm: 80 as const,
      copies: 1,
      autoPrint: true,
    };
    await expect(reprintReceiptData(sample, preferences, target)).rejects.toThrow("hors ligne");
    await expect(reprintReceiptData(sample, preferences, target)).resolves.toBe("silent");
    expect(native).toHaveBeenCalledTimes(2);
    expect(native.mock.calls[0][0].content).toBe(native.mock.calls[1][0].content);
    expect(native.mock.calls[0][0].content).toContain("DUPLICATA");
  });
});
