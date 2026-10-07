import type { StockStatus } from '../types/inventory'

export function stockValue(quantity: number, unitCost: number) { return quantity * unitCost }

export function weightedAverageCost(currentQuantity: number, currentCost: number, addedQuantity: number, addedCost: number) {
  const total = currentQuantity + addedQuantity
  return total <= 0 ? 0 : ((currentQuantity * currentCost) + (addedQuantity * addedCost)) / total
}

export function getStockStatus(current: number, minimum: number): StockStatus {
  if (current <= 0) return 'rupture'
  return current <= minimum ? 'stock_bas' : 'normal'
}

export function recipeCost(ingredients: Array<{ quantity: number; unitCost: number }>, yieldQuantity = 1) {
  if (yieldQuantity <= 0) return 0
  return ingredients.reduce((sum, item) => sum + item.quantity * item.unitCost, 0) / yieldQuantity
}

export function estimatedGrossMargin(salePrice: number, materialCost: number) { return salePrice - materialCost }

export function aggregateIngredients(items: Array<{ materialId: string; quantity: number }>) {
  return Object.values(items.reduce<Record<string, { materialId: string; quantity: number }>>((result, item) => {
    result[item.materialId] = { materialId: item.materialId, quantity: (result[item.materialId]?.quantity || 0) + item.quantity }
    return result
  }, {})).sort((a, b) => a.materialId.localeCompare(b.materialId))
}

export function formatQuantity(value: number, precision: number, unitCode?: string) {
  const formatted = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: precision }).format(value)
  return unitCode ? `${formatted} ${unitCode}` : formatted
}
