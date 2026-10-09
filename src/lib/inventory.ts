import type { StockStatus } from "../types/inventory";

export function quantityStep(precision: number) {
  const normalized = Math.min(6, Math.max(0, Math.trunc(precision)));
  return 10 ** -normalized;
}

export function isValidStockQuantity(value: number, precision: number, allowZero = false) {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) return false;
  const normalized = Math.min(6, Math.max(0, Math.trunc(precision)));
  return value === Number(value.toFixed(normalized));
}

export function stockValue(quantity: number, unitCost: number) {
  return quantity * unitCost;
}

export function weightedAverageCost(
  currentQuantity: number,
  currentCost: number,
  addedQuantity: number,
  addedCost: number,
) {
  const total = currentQuantity + addedQuantity;
  return total <= 0 ? 0 : (currentQuantity * currentCost + addedQuantity * addedCost) / total;
}

export function getStockStatus(current: number, minimum: number): StockStatus {
  if (current <= 0) return "rupture";
  return current <= minimum ? "stock_bas" : "normal";
}

export function recipeCost(
  ingredients: Array<{ quantity: number; unitCost: number }>,
  yieldQuantity = 1,
) {
  if (yieldQuantity <= 0) return 0;
  return ingredients.reduce((sum, item) => sum + item.quantity * item.unitCost, 0) / yieldQuantity;
}

export function estimatedGrossMargin(salePrice: number, materialCost: number) {
  return salePrice - materialCost;
}

export function aggregateIngredients(items: Array<{ materialId: string; quantity: number }>) {
  return Object.values(
    items.reduce<Record<string, { materialId: string; quantity: number }>>((result, item) => {
      result[item.materialId] = {
        materialId: item.materialId,
        quantity: (result[item.materialId]?.quantity || 0) + item.quantity,
      };
      return result;
    }, {}),
  ).sort((a, b) => a.materialId.localeCompare(b.materialId));
}

export function formatQuantity(value: number, precision: number, unitCode?: string) {
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  }).format(value);
  return unitCode ? `${formatted} ${unitCode}` : formatted;
}

export function parseInventoryQuantity(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function inventoryDifference(counted: number | null, theoretical: number) {
  return counted === null ? null : counted - theoretical;
}

export type InventoryLineFilter = "all" | "differences" | "uncounted" | "low";

export function matchesInventoryLineFilter(
  line: { matiere_nom: string; matiere_code: string; stock_theorique: number; stock_minimum: number },
  rawCount: string,
  query: string,
  filter: InventoryLineFilter,
) {
  const normalized = query.trim().toLocaleLowerCase("fr");
  const counted = parseInventoryQuantity(rawCount);
  const difference = counted === null || Number.isNaN(counted)
    ? null
    : inventoryDifference(counted, Number(line.stock_theorique));
  const matchesQuery = !normalized
    || line.matiere_nom.toLocaleLowerCase("fr").includes(normalized)
    || line.matiere_code.toLocaleLowerCase("fr").includes(normalized);
  return matchesQuery && (
    filter === "all"
    || (filter === "differences" && difference !== null && difference !== 0)
    || (filter === "uncounted" && counted === null)
    || (filter === "low" && Number(line.stock_theorique) <= Number(line.stock_minimum))
  );
}
