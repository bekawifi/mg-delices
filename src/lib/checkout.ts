import type { CartItem, OrderType, PaymentMethod } from '../types/database'

export function calculateChange(total: number, received: number) {
  return Math.max(0, received - total)
}

export function validateCheckout(items: CartItem[], total: number, received: number, customerId: string | null = null) {
  if (items.length === 0 || total <= 0) return 'Ajoutez au moins un produit au panier.'
  if (!Number.isFinite(received) || received < 0) return 'Les informations de paiement sont invalides.'
  if (received < total && !customerId) return 'Sélectionnez un client pour une vente à crédit.'
  return null
}

export function buildSalePayload(
  idempotencyKey: string,
  orderType: OrderType,
  discount: number,
  received: number,
  paymentMethod: PaymentMethod,
  items: CartItem[],
  customerId: string | null = null,
) {
  return {
    p_idempotency_key: idempotencyKey,
    p_type_commande: orderType,
    p_remise: discount,
    p_montant_recu: received,
    p_mode_paiement: paymentMethod,
    p_client_id: customerId,
    // Aucun prix n'est envoyé : create_sale le relit obligatoirement en base.
    p_lignes: items.map(item => ({ produit_id: item.product.id, quantite: item.quantity })),
  }
}
