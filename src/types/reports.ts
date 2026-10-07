export interface MetricRow { [key:string]: string|number|null }
export interface ProductionReport {
  periode:{from:string;to:string}
  ventes:{ca_brut:number;retours:number;nombre:number;par_type:MetricRow[];par_produit:MetricRow[];par_categorie:MetricRow[]}
  encaissements:{par_mode:MetricRow[];remboursements:number}
  clients:{creances:number;debiteurs:number;reglements:number;fidelite:number;meilleurs:MetricRow[]}
  stock:{valeur:number;bas:number;rupture:number;mouvements:number;pertes:number;consommations:number}
  achats:{receptionnes:number;paiements:number;dette:number;avoirs:number}
  depenses:{total:number;par_categorie:MetricRow[];par_mode:MetricRow[]}
  caisse:{ouvertures:number;clotures:number;ecarts:number;entrees:number;sorties:number}
  rentabilite:{ca_net:number;cout_matiere:number;depenses_exploitation:number;marge_brute:number;resultat_operationnel_simplifie:number}
}
