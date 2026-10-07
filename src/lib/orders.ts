import type { KitchenStatus, OrderStatus, TableState } from '../types/orders'

export const orderStatusLabel: Record<OrderStatus, string> = {
  ouverte: 'Ouverte', envoyee: 'Envoyée', en_preparation: 'En préparation', prete: 'Prête',
  servie: 'Servie', annulee: 'Annulée', cloturee: 'Clôturée',
}
export const kitchenStatusLabel: Record<KitchenStatus, string> = {
  a_preparer: 'À préparer', en_preparation: 'En préparation', prete: 'Prêt', servie: 'Servi', annulee: 'Annulé',
}
export const tableStateLabel: Record<TableState, string> = {
  libre: 'Libre', occupee: 'Occupée', attente_cuisine: 'En cuisine', prete: 'Prête', a_encaisser: 'À encaisser',
}
export const tableStateStyle: Record<TableState, string> = {
  libre: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  occupee: 'border-blue-200 bg-blue-50 text-blue-800',
  attente_cuisine: 'border-amber-200 bg-amber-50 text-amber-800',
  prete: 'border-violet-200 bg-violet-50 text-violet-800',
  a_encaisser: 'border-rose-200 bg-rose-50 text-rose-800',
}

export function elapsedMinutes(value: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000))
}

export function canTransitionKitchen(status: KitchenStatus, action: 'start' | 'ready') {
  return action === 'start' ? status === 'a_preparer' : status === 'en_preparation'
}
