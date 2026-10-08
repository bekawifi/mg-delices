import { formatMoney } from "../lib/format";
import { orderTypeLabel, paymentMethodLabel, type ReceiptData } from "../lib/receipt";

export function SaleReceiptDetails({ receipt }: { receipt: ReceiptData }) {
  const primaryPayment = receipt.paiements[0];
  return (
    <div className="my-6 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
        <div className="flex flex-wrap justify-between gap-2">
          <span>{new Date(receipt.vente.created_at).toLocaleString("fr-FR")}</span>
          <strong className="text-slate-800">{orderTypeLabel(receipt.vente.type_commande)}</strong>
        </div>
        <p className="mt-1">
          Caissier : <strong>{receipt.caissier}</strong>
          {receipt.client ? (
            <>
              {" "}
              · Client : <strong>{receipt.client}</strong>
            </>
          ) : null}
        </p>
        <p className="mt-1">
          Paiement : <strong>{paymentMethodLabel(primaryPayment?.mode)}</strong>
        </p>
      </div>
      <div className="divide-y divide-slate-100 px-5">
        {receipt.lignes.map((line, index) => (
          <div
            key={`${line.nom_produit}-${index}`}
            className="grid grid-cols-[1fr_auto] gap-4 py-3"
          >
            <div>
              <p className="font-bold text-slate-900">{line.nom_produit}</p>
              <p className="text-sm text-slate-500">
                {line.quantite} × {formatMoney(line.prix_unitaire)}
              </p>
            </div>
            <strong>{formatMoney(line.total_ligne)}</strong>
          </div>
        ))}
      </div>
      <dl className="space-y-2 border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm">
        <div className="flex justify-between">
          <dt>Sous-total</dt>
          <dd className="font-bold">{formatMoney(receipt.vente.sous_total)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Remise</dt>
          <dd className="font-bold">{formatMoney(receipt.vente.remise)}</dd>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-3 text-lg">
          <dt className="font-black">Total net</dt>
          <dd className="font-black text-emerald-800">{formatMoney(receipt.vente.total_final)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Montant payé</dt>
          <dd className="font-bold">{formatMoney(receipt.vente.montant_paye)}</dd>
        </div>
        {receipt.vente.reste_a_payer > 0 && (
          <div className="flex justify-between font-bold text-red-700">
            <dt>Reste à payer</dt>
            <dd>{formatMoney(receipt.vente.reste_a_payer)}</dd>
          </div>
        )}
        <div className="flex justify-between font-bold text-emerald-700">
          <dt>Monnaie rendue</dt>
          <dd>{formatMoney(receipt.vente.monnaie_rendue || 0)}</dd>
        </div>
        <div className="border-t border-slate-200 pt-3">
          <dt className="mb-2 font-bold text-slate-700">Paiements</dt>
          {receipt.paiements.length ? (
            receipt.paiements.map((payment, index) => (
              <dd
                key={`${payment.mode}-${payment.created_at || index}`}
                className="flex justify-between gap-3 py-1"
              >
                <span>
                  {paymentMethodLabel(payment.mode)}
                  {payment.reference ? ` · ${payment.reference}` : ""}
                </span>
                <strong>{formatMoney(payment.montant)}</strong>
              </dd>
            ))
          ) : (
            <dd className="text-slate-500">Aucun paiement enregistré</dd>
          )}
        </div>
      </dl>
    </div>
  );
}
