import { describe, expect, it } from 'vitest'
import { buildSalePayload, calculateChange, validateCheckout } from './checkout'
import type { CartItem, Product } from '../types/database'

const product: Product = {
  id: '11111111-1111-4111-8111-111111111111', categorie_id: null, nom: 'Riz sauce', description: null,
  prix_vente: 1500, cout_estime: 700, image_url: null, disponible: true, created_at: '', updated_at: '',
}
const cart: CartItem[] = [{ product, quantity: 2 }]

describe('encaissement', () => {
  it('calcule la monnaie sans jamais retourner une valeur négative', () => {
    expect(calculateChange(2800, 5000)).toBe(2200)
    expect(calculateChange(2800, 2000)).toBe(0)
  })

  it('exige un client pour un paiement partiel et refuse un montant invalide', () => {
    expect(validateCheckout(cart, 3000, 2999)).toBe('Sélectionnez un client pour une vente à crédit.')
    expect(validateCheckout(cart, 3000, 0, 'client-1')).toBeNull()
    expect(validateCheckout(cart, 3000, Number.NaN)).toBe('Les informations de paiement sont invalides.')
    expect(validateCheckout([], 0, 0)).toBe('Ajoutez au moins un produit au panier.')
  })

  it('réutilise la clé et ne transmet jamais de prix au RPC', () => {
    const key = '22222222-2222-4222-8222-222222222222'
    const first = buildSalePayload(key, 'sur_place', 200, 5000, 'especes', cart)
    const replay = buildSalePayload(key, 'sur_place', 200, 5000, 'especes', cart)
    expect(replay.p_idempotency_key).toBe(first.p_idempotency_key)
    expect(replay).toEqual(first)
    expect(first.p_lignes[0]).toEqual({ produit_id: product.id, quantite: 2 })
    expect(first.p_lignes[0]).not.toHaveProperty('prix_unitaire')
    expect(first.p_lignes[0]).not.toHaveProperty('prix_vente')
    expect(first.p_client_id).toBeNull()
  })
})
