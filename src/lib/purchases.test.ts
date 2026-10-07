import { describe, expect, it } from 'vitest'
import { amountRemaining, findDuplicateMaterialIndex, paymentStatus, purchaseLineTotal, purchaseTotal, supplierDebt, weightedCostAfterReceipt } from './purchases'
import { formatMoney } from './format'

describe('calculs achats fournisseurs', () => {
  it('calcule une ligne et le total serveur attendu', () => {
    expect(purchaseLineTotal(20, 600)).toBe(12000)
    expect(purchaseTotal([{ quantite: 20, cout_unitaire: 600 }, { quantite: 10, cout_unitaire: 1200 }])).toBe(24000)
  })
  it('calcule le reste et le statut de paiement', () => {
    expect(amountRemaining(24000, 10000)).toBe(14000)
    expect(paymentStatus(24000, 0)).toBe('receptionne')
    expect(paymentStatus(24000, 10000)).toBe('partiellement_paye')
    expect(paymentStatus(24000, 24000)).toBe('paye')
  })
  it('calcule le coût moyen après réception', () => {
    expect(weightedCostAfterReceipt(10, 1000, 10, 1200)).toBe(1100)
  })
  it('exclut brouillons et annulations de la dette', () => {
    expect(supplierDebt([{ total: 24000, paid: 10000, received: true }, { total: 5000, paid: 0, received: false }, { total: 3000, paid: 0, received: true, cancelled: true }])).toBe(14000)
  })
  it('formate la devise', () => {
    expect(formatMoney(24000)).toContain('24')
    expect(formatMoney(24000)).toContain('F CFA')
  })
  it('repère une matière déjà sélectionnée sans confondre la ligne courante', () => {
    const lines = [{ matiere_premiere_id: 'riz' }, { matiere_premiere_id: 'huile' }, { matiere_premiere_id: '' }]
    expect(findDuplicateMaterialIndex(lines, 'riz', 2)).toBe(0)
    expect(findDuplicateMaterialIndex(lines, 'huile', 1)).toBe(-1)
  })
})
