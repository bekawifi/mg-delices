export const returnAmount = (quantity: number, historicalUnitPrice: number, saleSubtotal = 0, saleTotal = 0) => {
  const ratio = saleSubtotal > 0 ? saleTotal / saleSubtotal : 1
  return Math.round(quantity * historicalUnitPrice * ratio * 100) / 100
}

export const returnableQuantity = (sold: number, alreadyReturned: number) =>
  Math.max(0, sold - alreadyReturned)

export const netRevenue = (grossSales: number, returns: number) => grossSales - returns
export const netReceipts = (payments: number, refunds: number) => payments - refunds
export const debtAfterReturn = (saleTotal: number, returned: number, paid: number) =>
  Math.max(0, saleTotal - returned - paid)
export const refundableAmount = (saleTotal: number, returned: number, paid: number) =>
  Math.max(0, paid - (saleTotal - returned))
export const creditAvailable = (creditAmount: number, refundedAmount: number) =>
  Math.max(0, creditAmount - refundedAmount)
export const supplierCreditAmount = (purchaseTotal: number, returned: number, paid: number) =>
  Math.max(0, paid - (purchaseTotal - returned))
export const loyaltyPointsToReverse = (pointsAwarded: number, pointsAlreadyReversed: number, netSaleTotal: number) =>
  Math.max(0, pointsAwarded - pointsAlreadyReversed - Math.floor(Math.max(0, netSaleTotal) / 1000))

export const exactStockReturnDelta = (consumed: number, sold: number, cumulativeReturned: number, alreadyRestored: number) => {
  if (sold <= 0) return 0
  const target = Math.round((consumed * Math.min(sold, Math.max(0, cumulativeReturned)) / sold) * 1_000_000) / 1_000_000
  return Math.max(0, Math.round((target - alreadyRestored) * 1_000_000) / 1_000_000)
}
