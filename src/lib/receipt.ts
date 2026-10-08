const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

const money = (value: number) => `${Number(value).toLocaleString("fr-FR")} F CFA`;
const plainMoney = (value: number) => Number(value).toLocaleString("fr-FR");

export interface ReceiptData {
  settings: {
    nom: string;
    telephone?: string;
    adresse?: string;
    logo_url?: string;
    pied_ticket: string;
    largeur_ticket: number;
    show_restopro_branding?: boolean;
  };
  vente: {
    numero: string;
    created_at: string;
    type_commande?: string;
    sous_total: number;
    remise: number;
    total_final: number;
    montant_recu?: number;
    montant_paye: number;
    reste_a_payer: number;
    monnaie_rendue?: number;
  };
  caissier: string;
  client?: string;
  duplicata?: boolean;
  lignes: Array<{
    quantite: number;
    nom_produit: string;
    prix_unitaire: number;
    total_ligne: number;
  }>;
  paiements: Array<{ mode: string; montant: number; reference?: string; created_at?: string }>;
}

export const orderTypeLabel = (value?: string) =>
  value === "sur_place"
    ? "Sur place"
    : value === "emporter"
      ? "À emporter"
      : value === "livraison"
        ? "Livraison"
        : "—";

export const paymentMethodLabel = (value?: string) =>
  value === "especes"
    ? "Espèces"
    : value === "orange_money"
      ? "Orange Money"
      : value === "moov_money"
        ? "Moov Money"
        : value === "autre"
          ? "Autre"
          : "—";

export function receiptHtml(receipt: ReceiptData) {
  const width = receipt.settings.largeur_ticket === 58 ? 58 : 80;
  const change = Number(receipt.vente.monnaie_rendue || 0);
  const due = Number(receipt.vente.reste_a_payer || 0);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(receipt.vente.numero)}</title><style>@page{size:${width}mm auto;margin:3mm}*{box-sizing:border-box}html,body{width:${width - 6}mm}body{font:12px/1.3 ui-monospace,monospace;margin:0;color:#111;overflow-wrap:anywhere}h1{text-align:center;font-size:18px;margin:4px 0}.logo{display:block;max-width:38mm;max-height:18mm;margin:0 auto 4px}.center{text-align:center}.row{display:flex;justify-content:space-between;gap:8px}.line{border-top:1px dashed #333;margin:8px 0}.total{font-size:15px;font-weight:900}.due{margin-top:5px;padding:5px 0;border:2px solid #111;font-size:15px;font-weight:900}.duplicate{text-align:center;border:2px solid #111;padding:5px;font-size:15px;font-weight:900}table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}@media print{button,.no-print{display:none!important}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body>${receipt.duplicata ? '<p class="duplicate">DUPLICATA — RÉIMPRESSION</p>' : ""}${receipt.settings.logo_url ? `<img class="logo" src="${escapeHtml(receipt.settings.logo_url)}" alt="">` : ""}<h1>${escapeHtml(receipt.settings.nom)}</h1><p class="center">${escapeHtml(receipt.settings.adresse || "")}<br>${escapeHtml(receipt.settings.telephone || "")}</p><div class="line"></div><p>Ticket N° ${escapeHtml(receipt.vente.numero)}<br>${new Date(receipt.vente.created_at).toLocaleString("fr-FR")}<br>Caissier : ${escapeHtml(receipt.caissier)}<br>Mode : ${escapeHtml(orderTypeLabel(receipt.vente.type_commande))}${receipt.client ? `<br>Client : ${escapeHtml(receipt.client)}` : ""}</p><div class="line"></div><table>${receipt.lignes.map((line) => `<tr><td>${escapeHtml(line.nom_produit)}<br><small>${line.quantite} × ${money(line.prix_unitaire)}</small></td><td>${money(line.total_ligne)}</td></tr>`).join("")}</table><div class="line"></div><div class="row"><span>Sous-total</span><b>${money(receipt.vente.sous_total)}</b></div><div class="row"><span>Remise</span><b>${money(receipt.vente.remise)}</b></div><div class="row total"><span>TOTAL</span><b>${money(receipt.vente.total_final)}</b></div><div class="row"><span>Payé</span><b>${money(receipt.vente.montant_paye)}</b></div>${due > 0 ? `<div class="row due"><span>RESTE À PAYER</span><b>${money(due)}</b></div>` : ""}<div class="row"><span>Monnaie rendue</span><b>${money(change)}</b></div><p>${receipt.paiements.map((payment) => `${escapeHtml(paymentMethodLabel(payment.mode))} : ${money(payment.montant)}`).join("<br>")}</p><div class="line"></div><p class="center">${escapeHtml(receipt.settings.pied_ticket)}</p></body></html>`;
}

export function brandedReceiptHtml(receipt: ReceiptData) {
  const html = receiptHtml(receipt);
  return receipt.settings.show_restopro_branding
    ? html.replace("</body>", '<p class="center"><small>Propulsé par RestoPRO</small></p></body>')
    : html;
}

const fit = (value: string, width: number) =>
  value.length <= width ? value : `${value.slice(0, Math.max(1, width - 1))}…`;
const centered = (value: string, width: number) => {
  const text = fit(value, width);
  return `${" ".repeat(Math.max(0, Math.floor((width - text.length) / 2)))}${text}`;
};
const columns = (label: string, value: string, width: number) => {
  const right = fit(value, Math.max(8, Math.floor(width * 0.42)));
  const left = fit(label, Math.max(1, width - right.length - 1));
  return `${left}${" ".repeat(Math.max(1, width - left.length - right.length))}${right}`;
};

export function thermalReceiptText(
  receipt: ReceiptData,
  widthMm: 58 | 80 = receipt.settings.largeur_ticket === 58 ? 58 : 80,
) {
  const width = widthMm === 58 ? 32 : 48;
  const separator = "-".repeat(width);
  const lines = [
    ...(receipt.duplicata ? [centered("DUPLICATA — RÉIMPRESSION", width), separator] : []),
    centered(receipt.settings.nom, width),
    ...(receipt.settings.adresse ? [centered(receipt.settings.adresse, width)] : []),
    ...(receipt.settings.telephone ? [centered(receipt.settings.telephone, width)] : []),
    "",
    `Ticket N° ${receipt.vente.numero}`,
    `Date ${new Date(receipt.vente.created_at).toLocaleString("fr-FR")}`,
    `Caissier ${receipt.caissier}`,
    `Mode ${orderTypeLabel(receipt.vente.type_commande)}`,
    ...(receipt.client ? [`Client ${receipt.client}`] : []),
    separator,
    columns("Article / Qté × PU", "Montant", width),
    separator,
  ];
  for (const item of receipt.lignes) {
    lines.push(fit(item.nom_produit, width));
    lines.push(
      columns(
        `${item.quantite} × ${plainMoney(item.prix_unitaire)}`,
        plainMoney(item.total_ligne),
        width,
      ),
    );
  }
  lines.push(
    separator,
    columns("Sous-total", plainMoney(receipt.vente.sous_total), width),
    columns("Remise", plainMoney(receipt.vente.remise), width),
    columns("TOTAL", plainMoney(receipt.vente.total_final), width),
    columns("Payé", plainMoney(receipt.vente.montant_paye), width),
  );
  if (receipt.vente.reste_a_payer > 0)
    lines.push(columns("Reste à payer", plainMoney(receipt.vente.reste_a_payer), width));
  lines.push(columns("Monnaie rendue", plainMoney(receipt.vente.monnaie_rendue || 0), width));
  for (const payment of receipt.paiements) {
    lines.push(columns(paymentMethodLabel(payment.mode), plainMoney(payment.montant), width));
  }
  lines.push(separator, centered(receipt.settings.pied_ticket, width));
  if (receipt.settings.show_restopro_branding) lines.push(centered("Propulsé par RestoPRO", width));
  return `${lines.join("\n")}\n\n\n`;
}
