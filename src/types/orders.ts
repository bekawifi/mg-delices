import type { OrderType, PaymentMethod } from './database'

export type OrderStatus = 'ouverte' | 'envoyee' | 'en_preparation' | 'prete' | 'servie' | 'annulee' | 'cloturee'
export type KitchenStatus = 'a_preparer' | 'en_preparation' | 'prete' | 'servie' | 'annulee'
export type TableState = 'libre' | 'occupee' | 'attente_cuisine' | 'prete' | 'a_encaisser'

export interface Zone { id: string; nom: string; ordre: number; actif: boolean; created_at: string; updated_at: string }
export interface RestaurantTable { id: string; zone_id: string; nom: string; numero: number; capacite: number; actif: boolean; created_at: string; updated_at: string }

export interface TableOverview {
  id: string; zone_id: string; zone_nom: string; zone_ordre: number; nom: string; numero: number
  capacite: number; actif: boolean; commande_id: string | null; numero_commande: string | null
  commande_statut: OrderStatus | null; opened_at: string | null; serveur_nom: string | null
  montant: number; etat: TableState
}

export interface OrderOverview {
  id: string; numero_commande: string; type_commande: OrderType; statut: OrderStatus
  opened_at: string; closed_at: string | null; table_nom: string | null; table_numero: number | null
  serveur_nom: string; nombre_articles: number; total: number
}

export interface OrderLine {
  id: string; produit_id: string; quantite: number; prix_unitaire_snapshot: number
  nom_produit_snapshot: string; notes: string | null; statut_cuisine: KitchenStatus
  sent_to_kitchen_at: string | null; created_at: string
}

export interface OrderEvent { event_type: string; details: Record<string, unknown>; created_at: string; actor_name: string }
export interface OrderDetail {
  id: string; numero_commande: string; type_commande: OrderType; statut: OrderStatus; notes: string | null
  opened_at: string; table_nom: string | null; table_numero: number | null; serveur_nom: string
  total: number; lignes: OrderLine[]; events: OrderEvent[]
}

export interface KitchenGroup {
  commande_id: string; numero_commande: string; type_commande: OrderType; table_nom: string | null
  table_numero: number | null; premier_envoi: string; lignes: Array<{
    id: string; nom: string; quantite: number; notes: string | null
    statut_cuisine: KitchenStatus; sent_to_kitchen_at: string
  }>
}

export interface OrderCheckout {
  discount: number; received: number; paymentMethod: PaymentMethod; idempotencyKey: string
}
