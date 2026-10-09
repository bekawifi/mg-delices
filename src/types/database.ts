export type Role = 'super_admin' | 'admin' | 'gestionnaire' | 'caissier' | 'serveur' | 'cuisine'
export type OrderType = 'sur_place' | 'emporter' | 'livraison'
export type PaymentMethod = 'especes' | 'orange_money' | 'moov_money' | 'autre'

export interface Profile {
  id: string
  full_name: string
  role: Role
  is_active: boolean
  created_at: string
  updated_at: string
  last_login_at?: string | null
  is_super_admin?: boolean
}

export interface Category {
  id: string
  nom: string
  ordre: number
  actif: boolean
  created_at: string
}

export interface Product {
  id: string
  categorie_id: string | null
  nom: string
  description: string | null
  prix_vente: number
  cout_estime: number
  image_url: string | null
  disponible: boolean
  created_at: string
  updated_at: string
  categories?: { nom: string } | null
}

export interface CartItem { product: Product; quantity: number }

export interface SaleSummary {
  id: string
  numero: string
  total_final: number
  statut: string
  created_at: string
  type_commande?: OrderType
  montant_paye?: number
  reste_a_payer?: number
  statut_paiement?: 'impayee' | 'partiellement_payee' | 'payee'
}

export interface DashboardStats {
  chiffre_affaires: number
  encaissements: number
  nombre_ventes: number
  panier_moyen: number
  dernieres_ventes: SaleSummary[]
  produits_populaires: Array<{ nom: string; quantite: number; montant: number }>
  creances_clients?: number
  clients_debiteurs?: number
  ventes_brutes?: number
  ca_net?: number
  retours_clients?: number
  remboursements?: number
  avoirs_clients_ouverts?: number
  avoirs_fournisseurs_ouverts?: number
}
