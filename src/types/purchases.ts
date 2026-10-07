export type PurchaseStatus = 'brouillon' | 'valide' | 'receptionne' | 'partiellement_paye' | 'paye' | 'annule'
export type SupplierPaymentMethod = 'especes' | 'orange_money' | 'moov_money' | 'virement' | 'autre'

export interface SupplierBalance {
  id: string
  code: string
  nom: string
  telephone: string
  email: string | null
  adresse: string | null
  notes: string | null
  actif: boolean
  total_achats: number
  total_paye: number
  reste_du: number
  achats_non_soldes: number
  dernier_achat: string | null
}

export interface PurchaseSummary {
  id: string
  numero_achat: string
  fournisseur_id: string
  fournisseur_nom: string
  statut: PurchaseStatus
  date_achat: string
  date_reception: string | null
  total: number
  montant_paye: number
  reste_a_payer: number
  notes: string | null
  created_at: string
}

export interface PurchaseLine {
  id?: string
  matiere_premiere_id: string
  nom_matiere_snapshot?: string
  unite_snapshot?: string
  quantite: number
  cout_unitaire: number
  total_ligne?: number
}

export interface SupplierPayment {
  id: string
  montant: number
  mode_paiement: SupplierPaymentMethod
  reference: string | null
  note: string | null
  created_at: string
  created_by_name?: string
}

export interface PurchaseDetail extends PurchaseSummary {
  lignes: PurchaseLine[]
  paiements: SupplierPayment[]
  mouvements: Array<{ id: string; matiere_nom: string; quantite: number; stock_avant: number; stock_apres: number; created_at: string }>
}

export interface SupplierDashboardStats {
  dette_fournisseurs: number
  achats_du_jour: number
  paiements_du_jour: number
  achats_non_soldes: number
}
