import type { PaymentMethod } from './database'

export interface Customer {
  id: string
  numero: string
  nom: string
  telephone: string | null
  email: string | null
  adresse: string | null
  plafond_credit: number
  encours_credit: number
  points_fidelite: number
  actif: boolean
  created_at: string
  updated_at: string
}

export interface CustomerSale {
  id: string
  numero: string
  total_final: number
  montant_paye: number
  reste_a_payer: number
  statut_paiement: 'impayee' | 'partiellement_payee' | 'payee'
  created_at: string
}

export interface CustomerPayment {
  id: string
  vente_id: string
  numero: string
  mode: PaymentMethod
  montant: number
  reference: string | null
  note: string | null
  created_at: string
}

export interface LoyaltyMovement {
  id: string
  points: number
  solde_apres: number
  note: string | null
  created_at: string
}

export interface CustomerDetail extends Customer {
  ventes: CustomerSale[]
  paiements: CustomerPayment[]
  fidelite: LoyaltyMovement[]
}
