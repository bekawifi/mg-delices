import type { CartItem } from '../types/database'

export function calculateCart(items: CartItem[], discount: number) {
  const subtotal = items.reduce((sum, item) => sum + item.product.prix_vente * item.quantity, 0)
  const safeDiscount = Math.max(0, Math.min(Number.isFinite(discount) ? discount : 0, subtotal))
  return { subtotal, discount: safeDiscount, total: subtotal - safeDiscount }
}
