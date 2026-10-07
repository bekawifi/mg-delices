export const paymentApplied = (total: number, received: number) => Math.min(Math.max(0, received), Math.max(0, total))

export const remainingAfterPayment = (total: number, received: number) => Math.max(0, total - paymentApplied(total, received))

export const creditAvailable = (limit: number, outstanding: number) => Math.max(0, limit - outstanding)

export function validateCreditCheckout(total: number, received: number, customerId: string | null) {
  if (!Number.isFinite(received) || received < 0) return 'Les informations de paiement sont invalides.'
  if (remainingAfterPayment(total, received) > 0 && !customerId) return 'Sélectionnez un client pour une vente à crédit.'
  return null
}
