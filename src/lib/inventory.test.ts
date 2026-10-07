import { describe, expect, it } from 'vitest'
import { aggregateIngredients, estimatedGrossMargin, getStockStatus, recipeCost, stockValue, weightedAverageCost } from './inventory'

describe('gestion du stock', () => {
  it('calcule la valeur et le coût moyen pondéré', () => {
    expect(stockValue(10, 1100)).toBe(11000)
    expect(weightedAverageCost(10, 1000, 10, 1200)).toBe(1100)
  })
  it('détermine les trois statuts de stock', () => {
    expect(getStockStatus(0, 2)).toBe('rupture')
    expect(getStockStatus(1, 2)).toBe('stock_bas')
    expect(getStockStatus(3, 2)).toBe('normal')
  })
  it('calcule le coût recette et la marge brute estimée', () => {
    const cost = recipeCost([{ quantity: 1, unitCost: 2000 }, { quantity: .05, unitCost: 1500 }, { quantity: .02, unitCost: 4000 }])
    expect(cost).toBe(2155)
    expect(estimatedGrossMargin(3500, cost)).toBe(1345)
  })
  it('agrège une matière présente plusieurs fois', () => {
    expect(aggregateIngredients([{ materialId: 'huile', quantity: .05 }, { materialId: 'huile', quantity: .02 }, { materialId: 'sel', quantity: .01 }]))
      .toEqual([{ materialId: 'huile', quantity: .07 }, { materialId: 'sel', quantity: .01 }])
  })
})
