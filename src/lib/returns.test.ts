import { describe, expect, it } from 'vitest'
import { creditAvailable, debtAfterReturn, exactStockReturnDelta, loyaltyPointsToReverse, netReceipts, netRevenue, refundableAmount, returnableQuantity, returnAmount, supplierCreditAmount } from './returns'

describe('corrections commerciales', () => {
  it('calcule un retour depuis le prix historique et la remise de vente', () => expect(returnAmount(1, 700, 7000, 6300)).toBe(630))
  it('calcule la quantite encore retournable', () => expect(returnableQuantity(3, 1)).toBe(2))
  it('calcule le CA net', () => expect(netRevenue(10000, 3000)).toBe(7000))
  it('calcule les encaissements nets', () => expect(netReceipts(10000, 2500)).toBe(7500))
  it('reduit la creance sans remboursement', () => expect(debtAfterReturn(20000, 8000, 5000)).toBe(7000))
  it('calcule uniquement le trop-percu remboursable', () => expect(refundableAmount(20000, 5000, 18000)).toBe(3000))
  it('suit le solde d avoir client', () => expect(creditAvailable(3000, 1200)).toBe(1800))
  it('calcule l avoir fournisseur sur un achat trop paye', () => expect(supplierCreditAmount(20000, 5000, 18000)).toBe(3000))
  it('reprend les points sur le total net de facon deterministe', () => expect(loyaltyPointsToReverse(10, 0, 7000)).toBe(3))
  it('ventile exactement une reprise partielle par ligne', () => expect(exactStockReturnDelta(2, 2, 1, 0)).toBe(1))
  it('solde le snapshot au second retour sans depassement', () => expect(exactStockReturnDelta(2, 2, 2, 1)).toBe(1))
})
