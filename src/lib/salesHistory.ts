import { paymentMethodLabel } from "./receipt";

export interface SaleHistoryRow {
  id: string;
  numero: string;
  created_at: string;
  type_commande: string;
  total_final: number;
  montant_paye: number;
  reste_a_payer: number;
  statut_paiement: string;
  client: string;
  caissier: string;
  mode_paiement?: string | null;
}

export interface SaleHistoryResult {
  rows: SaleHistoryRow[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export const salePaymentStatusLabel = (status: string) =>
  status === "payee"
    ? "Payée"
    : status === "partiellement_payee"
      ? "Partiellement payée"
      : status === "impayee"
        ? "Impayée"
        : status.replace(/_/g, " ");

export const salePaymentStatusClass = (status: string) =>
  status === "payee"
    ? "bg-emerald-100 text-emerald-800"
    : status === "partiellement_payee"
      ? "bg-amber-100 text-amber-800"
      : "bg-red-100 text-red-800";

export const primaryPaymentLabel = (mode?: string | null) =>
  mode ? paymentMethodLabel(mode) : "Aucun paiement";
