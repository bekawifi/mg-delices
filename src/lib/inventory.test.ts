import { describe, expect, it } from 'vitest'
import { aggregateIngredients, estimatedGrossMargin, getStockStatus, isValidStockQuantity, quantityStep, recipeCost, stockValue, weightedAverageCost } from './inventory'

describe('gestion du stock', () => {
  it('aligne le pas de saisie sur la précision métier', () => {
    expect(quantityStep(0)).toBe(1)
    expect(quantityStep(2)).toBe(0.01)
    expect(quantityStep(3)).toBe(0.001)
  })
  it('accepte les quantités entières positives', () => {
    for (const quantity of [1, 10, 25, 100]) {
      expect(isValidStockQuantity(quantity, 0)).toBe(true)
      expect(isValidStockQuantity(quantity, 3)).toBe(true)
    }
  })
  it('refuse zéro, les négatifs et les décimales hors précision', () => {
    expect(isValidStockQuantity(0, 3)).toBe(false)
    expect(isValidStockQuantity(-1, 3)).toBe(false)
    expect(isValidStockQuantity(1.5, 0)).toBe(false)
    expect(isValidStockQuantity(1.0001, 3)).toBe(false)
  })
  it('accepte les décimales autorisées et zéro pour un inventaire', () => {
    expect(isValidStockQuantity(0.001, 3)).toBe(true)
    expect(isValidStockQuantity(1.25, 2)).toBe(true)
    expect(isValidStockQuantity(0, 0, true)).toBe(true)
  })
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
