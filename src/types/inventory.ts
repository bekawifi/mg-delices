export type StockStatus = 'normal' | 'stock_bas' | 'rupture'
export type StockMovementType = 'entree' | 'vente' | 'ajustement_positif' | 'ajustement_negatif' | 'perte' | 'casse' | 'inventaire'

export interface Unit { id: string; code: string; nom: string; precision_decimale: number; actif: boolean; created_at: string }
export interface Material {
  id: string; code: string; nom: string; unite_id: string; unite_code: string; unite_nom: string
  precision_decimale: number; stock_actuel: number; stock_minimum: number; cout_unitaire_moyen: number
  valeur_stock: number; statut: StockStatus; actif: boolean
}
export interface StockMovement {
  id: string; matiere_premiere_id: string; matiere_nom: string; unite_code: string
  type_mouvement: StockMovementType; quantite: number; stock_avant: number; stock_apres: number
  cout_unitaire_snapshot: number | null; reference_type: string | null; reference_id: string | null
  note: string | null; created_by_name: string; created_at: string
}
export interface RecipeIngredient {
  matiere_id: string; matiere_nom: string; quantite: number; unite_code: string; cout_unitaire: number
}
export interface RecipeOverview {
  produit_id: string; produit_nom: string; prix_vente: number; recette_id: string | null
  recette_nom: string | null; rendement_quantite: number | null; cout_matieres: number; ingredients: RecipeIngredient[]
}
export interface InventoryLine {
  id: string; matiere_id: string; matiere_code: string; matiere_nom: string; unite_code: string
  precision_decimale: number; stock_theorique: number; stock_minimum: number
  quantite_comptee: number | null; ecart: number | null; motif: string | null; commentaire: string | null
}
export interface InventoryDetail {
  id: string; numero: string; statut: 'brouillon' | 'valide'; note: string | null; created_at: string
  validated_at: string | null; utilisateur: string; validated_by_name: string | null; lignes: InventoryLine[]
}
