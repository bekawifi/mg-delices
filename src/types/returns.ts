export interface CustomerReturnSummary {
  id: string; numero: string; vente_id: string; vente_numero: string; client_nom: string | null
  montant: number; stock_reintegrable: boolean; montant_rembourse: number; avoir_disponible: number; avoir_id?: string | null
  auteur: string; statut: string; created_at: string
}
export interface ReturnableSaleLine { id: string; nom: string; quantite_vendue: number; quantite_retournee: number; prix_unitaire: number }
export interface ReturnableSaleDetail { vente: { id:string; numero:string; sous_total:number; total_final:number; montant_paye:number; montant_retourne:number }; lignes: ReturnableSaleLine[] }
export interface SupplierReturnSummary {
  id:string; numero:string; achat_id:string; numero_achat:string; fournisseur_nom:string; montant:number
  avoir_disponible:number; auteur:string; created_at:string
}
export interface ReturnablePurchaseLine { id:string; nom:string; unite:string; quantite_recue:number; quantite_retournee:number; cout_unitaire:number }
export interface ReturnablePurchaseDetail { achat:{id:string;numero_achat:string;total:number;montant_paye:number;montant_retourne:number}; fournisseur_nom:string; lignes:ReturnablePurchaseLine[] }
