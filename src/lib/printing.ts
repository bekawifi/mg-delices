import { brandedReceiptHtml, receiptHtml, type ReceiptData } from "./receipt";

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
const money = (value: number) => `${Number(value).toLocaleString("fr-FR")} F CFA`;

export type SaleReceipt = ReceiptData;
export const saleReceiptHtml = receiptHtml;

export const brandedSaleReceiptHtml = brandedReceiptHtml;

export interface RestaurantTicket {
  restaurantName: string;
  showRestoProBranding?: boolean;
  numero: string;
  table?: string;
  serveur: string;
  date: string;
  lignes: Array<{ quantite: number; designation: string; prix: number }>;
  total: number;
  paye: number;
  reste: number;
  mode?: string;
}
export function restaurantTicketHtml(ticket: RestaurantTicket) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(ticket.numero)}</title><style>@page{size:80mm auto;margin:4mm}body{font:12px ui-monospace,monospace}h1{text-align:center}table{width:100%}td:last-child{text-align:right}.total{font-weight:800;font-size:14px}</style></head><body><h1>${escapeHtml(ticket.restaurantName)}</h1><p>Commande ${escapeHtml(ticket.numero)}<br>${escapeHtml(ticket.table || "À emporter")} · ${new Date(ticket.date).toLocaleString("fr-FR")}<br>Serveur : ${escapeHtml(ticket.serveur)}</p><table>${ticket.lignes.map((line) => `<tr><td>${line.quantite} × ${escapeHtml(line.designation)}</td><td>${money(line.quantite * line.prix)}</td></tr>`).join("")}</table><hr><p class="total">Total : ${money(ticket.total)}</p><p>Payé : ${money(ticket.paye)}<br>Reste : ${money(ticket.reste)}${ticket.mode ? `<br>Paiement : ${escapeHtml(ticket.mode)}` : ""}</p><p style="text-align:center">Merci pour votre confiance.</p>${ticket.showRestoProBranding ? '<p style="text-align:center"><small>Propulsé par RestoPRO</small></p>' : ""}</body></html>`;
}

export interface KitchenTicket {
  numero: string;
  table?: string;
  serveur?: string;
  date: string;
  largeur?: 58 | 80;
  lignes: Array<{ quantite: number; designation: string; notes?: string }>;
}
export function kitchenTicketHtml(ticket: KitchenTicket) {
  const width = ticket.largeur === 58 ? 58 : 80;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cuisine ${escapeHtml(ticket.numero)}</title><style>@page{size:${width}mm auto;margin:3mm}body{width:${width - 6}mm;margin:0;font:14px ui-monospace,monospace}h1{text-align:center}.item{border-top:1px dashed #333;padding:7px 0;font-weight:800}.notes{font-weight:400}@media print{button{display:none!important}}</style></head><body><h1>BON CUISINE</h1><p>${escapeHtml(ticket.table || "À emporter")}<br>Commande ${escapeHtml(ticket.numero)}${ticket.serveur ? `<br>Serveur : ${escapeHtml(ticket.serveur)}` : ""}<br>${new Date(ticket.date).toLocaleString("fr-FR")}</p>${ticket.lignes.map((line) => `<div class="item">${line.quantite} × ${escapeHtml(line.designation)}${line.notes ? `<div class="notes">Note : ${escapeHtml(line.notes)}</div>` : ""}</div>`).join("")}</body></html>`;
}

export interface FinancialReceipt {
  restaurantName: string;
  showRestoProBranding?: boolean;
  type: string;
  identifiant: string;
  reference: string;
  date: string;
  tiers?: string;
  montant: number;
  mode?: string;
  utilisateur: string;
}
export function financialReceiptHtml(receipt: FinancialReceipt) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(receipt.identifiant)}</title><style>@page{size:A4;margin:18mm}body{font:14px system-ui;color:#111}h1{color:#064e3b}.amount{font-size:22px;font-weight:800}</style></head><body><h1>${escapeHtml(receipt.restaurantName)}</h1><h2>${escapeHtml(receipt.type)}</h2><p>Identifiant : ${escapeHtml(receipt.identifiant)}<br>Référence : ${escapeHtml(receipt.reference)}<br>Date : ${new Date(receipt.date).toLocaleString("fr-FR")}${receipt.tiers ? `<br>Tiers : ${escapeHtml(receipt.tiers)}` : ""}<br>Utilisateur : ${escapeHtml(receipt.utilisateur)}</p><p class="amount">${money(receipt.montant)}</p>${receipt.mode ? `<p>Mode : ${escapeHtml(receipt.mode)}</p>` : ""}${receipt.showRestoProBranding ? "<p><small>Généré avec RestoPRO</small></p>" : ""}</body></html>`;
}

export function printHtml(html: string) {
  const popup = window.open("", "_blank", "width=480,height=720");
  if (!popup) throw new Error("Fenêtre d’impression bloquée");
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.addEventListener("load", () => popup.print(), { once: true });
}
