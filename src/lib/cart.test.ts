import { describe, expect, it } from 'vitest'
import { calculateCart } from './cart'
import type { CartItem, Product } from '../types/database'

const product = (prix_vente: number): Product => ({
  id: crypto.randomUUID(), categorie_id: null, nom: 'Test', description: null,
  prix_vente, cout_estime: 0, image_url: null, disponible: true,
  created_at: '', updated_at: '',
})

describe('calculateCart', () => {
  it('calcule le sous-total et la remise', () => {
    const items: CartItem[] = [{ product: product(1500), quantity: 2 }, { product: product(500), quantity: 1 }]
    expect(calculateCart(items, 500)).toEqual({ subtotal: 3500, discount: 500, total: 3000 })
  })
  it('borne la remise au total et à zéro', () => {
    const items: CartItem[] = [{ product: product(1000), quantity: 1 }]
    expect(calculateCart(items, 2000).total).toBe(0)
    expect(calculateCart(items, -5).discount).toBe(0)
  })
})
