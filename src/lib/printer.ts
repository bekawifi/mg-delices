import { invoke, isTauri } from "@tauri-apps/api/core";
import { thermalReceiptText, type ReceiptData } from "./receipt";

export interface PrintPreferences {
  silent: boolean;
  printerName: string;
  widthMm: 58 | 80;
  copies: number;
  autoPrint: boolean;
}

export const DEFAULT_PRINT_PREFERENCES: PrintPreferences = {
  silent: false,
  printerName: "",
  widthMm: 80,
  copies: 1,
  autoPrint: false,
};

export function printerErrorMessage(
  error: unknown,
  fallback = "Le ticket n’a pas pu être imprimé.",
) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

const STORAGE_KEY = "restopro.print.preferences.v1";
type StorageLike = Pick<Storage, "getItem" | "setItem">;

const normalizePreferences = (value: Partial<PrintPreferences>): PrintPreferences => ({
  silent: value.silent === true,
  printerName: typeof value.printerName === "string" ? value.printerName.trim() : "",
  widthMm: value.widthMm === 58 ? 58 : 80,
  copies: Math.min(5, Math.max(1, Math.trunc(Number(value.copies) || 1))),
  autoPrint: value.autoPrint === true,
});

export function loadPrintPreferences(
  storage: StorageLike | undefined = typeof window === "undefined"
    ? undefined
    : window.localStorage,
) {
  if (!storage) return DEFAULT_PRINT_PREFERENCES;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw
      ? normalizePreferences(JSON.parse(raw) as Partial<PrintPreferences>)
      : DEFAULT_PRINT_PREFERENCES;
  } catch {
    return DEFAULT_PRINT_PREFERENCES;
  }
}

export function savePrintPreferences(
  preferences: PrintPreferences,
  storage: StorageLike | undefined = typeof window === "undefined"
    ? undefined
    : window.localStorage,
) {
  const normalized = normalizePreferences(preferences);
  storage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export interface PrintTransport {
  listPrinters: () => Promise<string[]>;
  silentPrint: (request: {
    printerName: string;
    content: string;
    copies: number;
    widthMm: 58 | 80;
  }) => Promise<void>;
  dialogPrint: (request: { content: string; copies: number; widthMm: 58 | 80 }) => Promise<boolean>;
}

export const desktopPrintTransport: PrintTransport = {
  listPrinters: async () => (isTauri() ? invoke<string[]>("list_printers") : []),
  silentPrint: async (request) => {
    if (!isTauri())
      throw new Error("L’impression silencieuse est disponible uniquement dans RestoPRO Desktop.");
    await invoke("print_receipt_silent", { request });
  },
  dialogPrint: async (request) => {
    if (!isTauri())
      throw new Error(
        "Le dialogue d’impression Windows est disponible uniquement dans RestoPRO Desktop.",
      );
    return invoke<boolean>("print_receipt_dialog", {
      request: { ...request, printerName: "" },
    });
  },
};

export async function listAvailablePrinters(transport: PrintTransport = desktopPrintTransport) {
  return transport.listPrinters();
}

export async function printReceiptData(
  receipt: ReceiptData,
  preferences: PrintPreferences,
  transport: PrintTransport = desktopPrintTransport,
) {
  const normalized = normalizePreferences(preferences);
  if (!normalized.silent) {
    const printed = await transport.dialogPrint({
      content: thermalReceiptText(receipt, normalized.widthMm),
      copies: normalized.copies,
      widthMm: normalized.widthMm,
    });
    return printed ? ("dialog" as const) : ("cancelled" as const);
  }
  if (!normalized.printerName)
    throw new Error("Configurez une imprimante tickets avant d’activer l’impression silencieuse.");
  const printers = await transport.listPrinters();
  if (!printers.includes(normalized.printerName)) {
    throw new Error(
      `L’imprimante configurée « ${normalized.printerName} » est absente ou indisponible.`,
    );
  }
  await transport.silentPrint({
    printerName: normalized.printerName,
    content: thermalReceiptText(receipt, normalized.widthMm),
    copies: normalized.copies,
    widthMm: normalized.widthMm,
  });
  return "silent" as const;
}

export function reprintReceiptData(
  receipt: ReceiptData,
  preferences: PrintPreferences,
  transport: PrintTransport = desktopPrintTransport,
) {
  return printReceiptData({ ...receipt, duplicata: true }, preferences, transport);
}
