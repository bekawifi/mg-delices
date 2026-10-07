import type { PurchaseLine, PurchaseStatus } from '../types/purchases'

export const purchaseLineTotal = (quantity: number, unitCost: number) => Math.round(quantity * unitCost * 100) / 100

export const purchaseTotal = (lines: Pick<PurchaseLine, 'quantite' | 'cout_unitaire'>[]) =>
  Math.round(lines.reduce((sum, line) => sum + purchaseLineTotal(line.quantite, line.cout_unitaire), 0) * 100) / 100

export const findDuplicateMaterialIndex = (
  lines: Pick<PurchaseLine, 'matiere_premiere_id'>[], materialId: string, excludedIndex: number,
) => lines.findIndex((line, index) => index !== excludedIndex && line.matiere_premiere_id === materialId)

export const amountRemaining = (total: number, paid: number) => Math.max(0, Math.round((total - paid) * 100) / 100)

export const paymentStatus = (total: number, paid: number, received = true): PurchaseStatus => {
  if (!received) return 'brouillon'
  if (paid <= 0) return 'receptionne'
  return paid >= total ? 'paye' : 'partiellement_paye'
}

export const supplierDebt = (purchases: Array<{ total: number; paid: number; received: boolean; cancelled?: boolean }>) =>
  purchases.reduce((sum, purchase) => purchase.received && !purchase.cancelled
    ? sum + amountRemaining(purchase.total, purchase.paid)
    : sum, 0)

export const weightedCostAfterReceipt = (stock: number, currentCost: number, received: number, receivedCost: number) => {
  const nextStock = stock + received
  return nextStock <= 0 ? receivedCost : ((stock * currentCost) + (received * receivedCost)) / nextStock
}
