import { describe, expect, it } from 'vitest'
import {
  cashDifference,
  classifyCash,
  countTotal,
  progressiveCashBalances,
  simplifiedOperatingResult,
  theoreticalCash,
} from './cash'

describe('caisse journalière', () => {
  it('A. compte le fond une seule fois pour une ouverture seule', () => {
    expect(theoreticalCash(20_000, [], [])).toBe(20_000)
  })

  it('B. ajoute une vente au fond sans recompter l’ouverture', () => {
    expect(theoreticalCash(20_000, [5_000], [])).toBe(25_000)
  })

  it('C. déduit une dépense du fond et de la vente', () => {
    expect(theoreticalCash(20_000, [5_000], [2_000])).toBe(23_000)
  })

  it('D. garde le fond exact sur la première position du journal', () => {
    const balances = progressiveCashBalances(20_000, [
      { type_mouvement: 'ouverture', sens: 'entree', montant: 20_000 },
      { type_mouvement: 'vente', sens: 'entree', montant: 5_000 },
      { type_mouvement: 'depense', sens: 'sortie', montant: 2_000 },
    ])
    expect(balances).toEqual([20_000, 25_000, 23_000])
  })

  it('E. exclut le fond du chiffre d’affaires et du résultat opérationnel', () => {
    expect(simplifiedOperatingResult(5_000, 0, 2_000)).toBe(3_000)
  })

  it('calcule les écarts', () => {
    expect(cashDifference(31_000, 30_000)).toBe(1_000)
    expect(cashDifference(29_500, 30_000)).toBe(-500)
  })

  it('totalise les coupures', () => {
    expect(countTotal([
      { denomination: 10_000, quantite: 2 },
      { denomination: 5_000, quantite: 1 },
    ])).toBe(25_000)
  })

  it('classe entrée et sortie', () => {
    expect(classifyCash(500, 'entree')).toEqual({ entree: 500, sortie: 0 })
    expect(classifyCash(500, 'sortie')).toEqual({ entree: 0, sortie: 500 })
  })
})
