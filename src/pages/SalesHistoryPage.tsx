import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, LoaderCircle, Printer, RefreshCw, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { SaleReceiptDetails } from "../components/SaleReceiptDetails";
import { supabase } from "../lib/supabase";
import { userMessageFromError } from "../lib/errors";
import { formatDateTime, formatMoney } from "../lib/format";
import { type ReceiptData } from "../lib/receipt";
import { loadPrintPreferences, printerErrorMessage, reprintReceiptData } from "../lib/printer";
import {
  primaryPaymentLabel,
  salePaymentStatusClass,
  salePaymentStatusLabel,
  type SaleHistoryResult,
  type SaleHistoryRow,
} from "../lib/salesHistory";

const EMPTY_RESULT: SaleHistoryResult = {
  rows: [],
  total: 0,
  limit: 10,
  offset: 0,
  has_more: false,
};

export function SalesHistoryList({
  sales,
  onView,
  onPrint,
  printingId,
}: {
  sales: SaleHistoryRow[];
  onView: (sale: SaleHistoryRow) => void;
  onPrint: (sale: SaleHistoryRow) => void;
  printingId?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-5 py-3">Vente</th>
            <th className="px-5 py-3">Client / caissier</th>
            <th className="px-5 py-3">Paiement</th>
            <th className="px-5 py-3 text-right">Total</th>
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sales.map((sale) => (
            <tr
              key={sale.id}
              className="cursor-pointer transition hover:bg-slate-50 focus-within:bg-slate-50"
              onClick={() => onView(sale)}
            >
              <td className="px-5 py-4">
                <button className="text-left font-black text-brand-700 hover:underline">
                  {sale.numero}
                </button>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(sale.created_at)}</p>
              </td>
              <td className="px-5 py-4">
                <p className="font-semibold">{sale.client || "Vente anonyme"}</p>
                <p className="mt-1 text-xs text-slate-500">{sale.caissier}</p>
              </td>
              <td className="px-5 py-4">
                <p>{primaryPaymentLabel(sale.mode_paiement)}</p>
                <span
                  className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${salePaymentStatusClass(sale.statut_paiement)}`}
                >
                  {salePaymentStatusLabel(sale.statut_paiement)}
                </span>
              </td>
              <td className="px-5 py-4 text-right text-base font-black">
                {formatMoney(sale.total_final)}
              </td>
              <td className="px-5 py-4">
                <div className="flex justify-end gap-2">
                  <button
                    className="btn-secondary px-3 py-2"
                    onClick={(event) => {
                      event.stopPropagation();
                      onView(sale);
                    }}
                  >
                    <Eye size={16} /> Voir le reçu
                  </button>
                  <button
                    className="btn-secondary px-3 py-2"
                    disabled={printingId === sale.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onPrint(sale);
                    }}
                  >
                    {printingId === sale.id ? (
                      <LoaderCircle className="animate-spin" size={16} />
                    ) : (
                      <Printer size={16} />
                    )}
                    Réimprimer
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SalesHistoryPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [result, setResult] = useState<SaleHistoryResult>(EMPTY_RESULT);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [selectedSale, setSelectedSale] = useState<SaleHistoryRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [printingId, setPrintingId] = useState("");
  const [retryPrint, setRetryPrint] = useState<{
    sale: SaleHistoryRow;
    receipt?: ReceiptData;
  } | null>(null);
  const requestNumber = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = async (offset = 0, append = false) => {
    const request = ++requestNumber.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    const limit = query || date || showAll ? 25 : 10;
    const { data, error: rpcError } = await supabase.rpc("search_sales_history", {
      p_search: query || null,
      p_date: date || null,
      p_limit: limit,
      p_offset: offset,
    });
    if (request !== requestNumber.current) return;
    if (rpcError) {
      setError(userMessageFromError(rpcError, "Impossible de charger l’historique des ventes."));
    } else {
      const next = data as SaleHistoryResult;
      setResult(append ? { ...next, rows: [...result.rows, ...next.rows] } : next);
    }
    setLoading(false);
    setLoadingMore(false);
  };

  useEffect(() => {
    void load();
    // La recherche déclenche une nouvelle page serveur après le délai de saisie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, date, showAll]);

  const fetchReceipt = async (sale: SaleHistoryRow) => {
    const { data, error: receiptError } = await supabase.rpc("get_sale_receipt", {
      p_sale_id: sale.id,
    });
    if (receiptError)
      throw new Error(userMessageFromError(receiptError, "Impossible de charger le reçu."));
    return data as ReceiptData;
  };

  const openReceipt = async (sale: SaleHistoryRow) => {
    setSelectedSale(sale);
    setReceipt(null);
    setDetailLoading(true);
    setError("");
    try {
      setReceipt(await fetchReceipt(sale));
    } catch (caught) {
      setError(userMessageFromError(caught, "Impossible de charger le reçu."));
    } finally {
      setDetailLoading(false);
    }
  };

  const reprint = async (sale: SaleHistoryRow, preparedReceipt?: ReceiptData) => {
    setPrintingId(sale.id);
    setError("");
    setNotice("");
    setRetryPrint(null);
    let details = preparedReceipt;
    try {
      details =
        details || (selectedSale?.id === sale.id && receipt ? receipt : await fetchReceipt(sale));
      const mode = await reprintReceiptData(details, loadPrintPreferences());
      setNotice(
        mode === "cancelled"
          ? "Impression annulée dans le dialogue Windows."
          : `Ticket ${sale.numero} envoyé à l’impression.`,
      );
    } catch (caught) {
      setError(printerErrorMessage(caught, "Le ticket n’a pas pu être réimprimé."));
      setRetryPrint({ sale, receipt: details });
    } finally {
      setPrintingId("");
    }
  };

  const recent = !query && !date && !showAll;
  return (
    <>
      <PageHeader
        title="Historique des ventes"
        description="Retrouvez une vente et réimprimez son reçu historique sans modifier la transaction."
        action={
          <Link className="btn-secondary" to="/caisse">
            <ArrowLeft size={18} /> Caisse
          </Link>
        }
      />

      <section className="card mb-5 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_auto]">
          <label className="relative">
            <span className="sr-only">Rechercher une vente</span>
            <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
            <input
              className="field pl-10"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setShowAll(false);
              }}
              placeholder="N° vente, client, caissier, paiement…"
            />
          </label>
          <label>
            <span className="sr-only">Filtrer par date</span>
            <input
              className="field"
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setShowAll(false);
              }}
            />
          </label>
          <button
            className="btn-secondary"
            onClick={() => {
              setSearch("");
              setQuery("");
              setDate("");
              setShowAll(false);
            }}
          >
            <RefreshCw size={18} /> Réinitialiser
          </button>
        </div>
      </section>

      {error && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{error}</span>
          {retryPrint && (
            <button
              className="btn-secondary"
              onClick={() => void reprint(retryPrint.sale, retryPrint.receipt)}
            >
              Réessayer l’impression
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          {notice}
        </p>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-black">{recent ? "Ventes récentes" : "Résultats"}</h2>
            <p className="text-xs text-slate-500">
              {recent ? "Les 10 dernières ventes" : `${result.total} vente(s) trouvée(s)`}
            </p>
          </div>
          {recent && (
            <button className="btn-secondary" onClick={() => setShowAll(true)}>
              Voir tout l’historique
            </button>
          )}
        </div>
        {loading ? (
          <div className="grid h-52 place-items-center text-slate-500">
            <LoaderCircle className="animate-spin" />
          </div>
        ) : result.rows.length ? (
          <>
            <SalesHistoryList
              sales={result.rows}
              onView={(sale) => void openReceipt(sale)}
              onPrint={(sale) => void reprint(sale)}
              printingId={printingId}
            />
            {result.has_more && (
              <div className="border-t p-4 text-center">
                <button
                  className="btn-secondary"
                  disabled={loadingMore}
                  onClick={() => void load(result.rows.length, true)}
                >
                  {loadingMore && <LoaderCircle className="animate-spin" size={18} />}
                  Charger plus
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="p-12 text-center text-sm text-slate-500">Aucune vente trouvée.</p>
        )}
      </section>

      {selectedSale && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Reçu ${selectedSale.numero}`}
        >
          <button
            className="absolute inset-0"
            aria-label="Fermer le reçu"
            onClick={() => setSelectedSale(null)}
          />
          <div className="card relative my-6 w-full max-w-2xl p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
                  Reçu de vente
                </p>
                <h2 className="text-2xl font-black">{selectedSale.numero}</h2>
              </div>
              <button
                className="rounded-lg p-2 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-400"
                onClick={() => setSelectedSale(null)}
                aria-label="Fermer"
              >
                <X />
              </button>
            </div>
            {detailLoading ? (
              <div className="grid h-64 place-items-center">
                <LoaderCircle className="animate-spin text-brand-600" />
              </div>
            ) : receipt ? (
              <SaleReceiptDetails receipt={receipt} />
            ) : (
              <p className="my-8 rounded-xl bg-red-50 p-4 text-red-700">Reçu indisponible.</p>
            )}
            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p>{error}</p>
                {retryPrint?.sale.id === selectedSale.id && (
                  <button
                    className="btn-secondary mt-3"
                    onClick={() => void reprint(selectedSale, retryPrint.receipt)}
                  >
                    Réessayer l’impression
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <button className="btn-secondary" onClick={() => setSelectedSale(null)}>
                Fermer
              </button>
              <button
                className="btn-primary"
                disabled={!receipt || printingId === selectedSale.id}
                onClick={() => void reprint(selectedSale)}
              >
                {printingId === selectedSale.id ? (
                  <LoaderCircle className="animate-spin" size={18} />
                ) : (
                  <Printer size={18} />
                )}
                Réimprimer le ticket
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
