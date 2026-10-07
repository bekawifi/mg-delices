import { describe, expect, it } from 'vitest'
import { creditAvailable, paymentApplied, remainingAfterPayment, validateCreditCheckout } from './credit'

describe('ventes à crédit', () => {
  it('autorise un paiement immédiat nul avec un client', () => {
    expect(validateCreditCheckout(5_000, 0, 'client-1')).toBeNull()
    expect(remainingAfterPayment(5_000, 0)).toBe(5_000)
  })

  it('exige un client dès qu’un reste est dû', () => {
    expect(validateCreditCheckout(5_000, 2_000, null)).toBe('Sélectionnez un client pour une vente à crédit.')
  })

  it('calcule paiement appliqué, reste et crédit disponible', () => {
    expect(paymentApplied(5_000, 7_000)).toBe(5_000)
    expect(remainingAfterPayment(5_000, 2_000)).toBe(3_000)
    expect(creditAvailable(20_000, 7_500)).toBe(12_500)
  })
})
