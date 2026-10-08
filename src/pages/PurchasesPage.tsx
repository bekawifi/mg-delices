import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Ban,
  Eye,
  LoaderCircle,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../lib/supabase";
import { userMessageFromError } from "../lib/errors";
import { formatDateTime, formatMoney } from "../lib/format";
import {
  amountRemaining,
  findDuplicateMaterialIndex,
  purchaseLineTotal,
  purchaseTotal,
} from "../lib/purchases";
import { isValidStockQuantity, quantityStep } from "../lib/inventory";
import type { Material } from "../types/inventory";
import type {
  PurchaseDetail,
  PurchaseLine,
  PurchaseStatus,
  PurchaseSummary,
  SupplierBalance,
  SupplierPaymentMethod,
} from "../types/purchases";

const statusLabel: Record<PurchaseStatus, string> = {
  brouillon: "Brouillon",
  valide: "Validé",
  receptionne: "Réceptionné",
  partiellement_paye: "Partiellement payé",
  paye: "Soldé",
  annule: "Annulé",
};
const statusStyle: Record<PurchaseStatus, string> = {
  brouillon: "bg-slate-100 text-slate-700",
  valide: "bg-blue-100 text-blue-700",
  receptionne: "bg-amber-100 text-amber-700",
  partiellement_paye: "bg-orange-100 text-orange-700",
  paye: "bg-emerald-100 text-emerald-700",
  annule: "bg-red-100 text-red-700",
};
const paymentLabels: Record<SupplierPaymentMethod, string> = {
  especes: "Espèces",
  orange_money: "Orange Money",
  moov_money: "Moov Money",
  virement: "Virement",
  autre: "Autre",
};
const today = () => new Date().toISOString().slice(0, 10);
const newLine = (): PurchaseLine => ({ matiere_premiere_id: "", quantite: 1, cout_unitaire: 0 });

export function PurchasesPage() {
  const [items, setItems] = useState<PurchaseSummary[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierBalance[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("tous");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [purchaseKey, setPurchaseKey] = useState(crypto.randomUUID());
  const [highlightedMaterialId, setHighlightedMaterialId] = useState<string | null>(null);
  const [form, setForm] = useState({
    fournisseur_id: "",
    date_achat: today(),
    notes: "",
    lignes: [newLine()],
  });
  const [detail, setDetail] = useState<PurchaseDetail | null>(null);
  const [operation, setOperation] = useState<"receive" | "payment" | null>(null);
  const [receptionKey, setReceptionKey] = useState(crypto.randomUUID());
  const [payment, setPayment] = useState({
    montant: 0,
    mode: "especes" as SupplierPaymentMethod,
    reference: "",
    note: "",
    key: crypto.randomUUID(),
  });

  const load = async () => {
    setLoading(true);
    setError("");
    const [purchases, supplierResult, stock] = await Promise.all([
      supabase.rpc("get_purchases_overview", {
        p_statut: status,
        p_fournisseur_id: supplierFilter || null,
        p_from: from || null,
        p_to: to || null,
      }),
      supabase.rpc("get_suppliers_balances"),
      supabase.rpc("get_stock_overview"),
    ]);
    if (purchases.error)
      setError(userMessageFromError(purchases.error, "Impossible de charger les achats."));
    else setItems((purchases.data || []) as PurchaseSummary[]);
    if (!supplierResult.error) setSuppliers((supplierResult.data || []) as SupplierBalance[]);
    if (!stock.error) setMaterials(((stock.data || []) as Material[]).filter((item) => item.actif));
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [status, supplierFilter, from, to]);
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((item) =>
      `${item.numero_achat} ${item.fournisseur_nom}`.toLowerCase().includes(q),
    );
  }, [items, search]);
  const total = useMemo(() => purchaseTotal(form.lignes), [form.lignes]);
  const activeSuppliers = suppliers.filter((item) => item.actif);

  const openNew = () => {
    setEditingId(null);
    setPurchaseKey(crypto.randomUUID());
    setForm({
      fournisseur_id: activeSuppliers[0]?.id || "",
      date_achat: today(),
      notes: "",
      lignes: [newLine()],
    });
    setEditorOpen(true);
    setError("");
  };
  const openDetail = async (id: string) => {
    setError("");
    const { data, error: rpcError } = await supabase.rpc("get_purchase_detail", { p_achat_id: id });
    if (rpcError) setError(userMessageFromError(rpcError, "Impossible de charger cet achat."));
    else setDetail(data as PurchaseDetail);
  };
  const editDraft = () => {
    if (!detail) return;
    setEditingId(detail.id);
    setForm({
      fournisseur_id: detail.fournisseur_id,
      date_achat: detail.date_achat,
      notes: detail.notes || "",
      lignes: detail.lignes.map((line) => ({
        matiere_premiere_id: line.matiere_premiere_id,
        quantite: Number(line.quantite),
        cout_unitaire: Number(line.cout_unitaire),
      })),
    });
    setDetail(null);
    setEditorOpen(true);
    setError("");
  };
  const updateLine = (index: number, patch: Partial<PurchaseLine>) =>
    setForm({
      ...form,
      lignes: form.lignes.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    });
  const selectMaterial = (index: number, materialId: string) => {
    const duplicateIndex = findDuplicateMaterialIndex(form.lignes, materialId, index);
    if (materialId && duplicateIndex >= 0) {
      setError("Cette matière première est déjà présente dans l’achat.");
      setHighlightedMaterialId(materialId);
      if (!form.lignes[index].matiere_premiere_id && form.lignes.length > 1)
        setForm({ ...form, lignes: form.lignes.filter((_, lineIndex) => lineIndex !== index) });
      window.setTimeout(() => {
        const row = document.querySelector<HTMLElement>(`[data-material-id="${materialId}"]`);
        row?.scrollIntoView({ behavior: "smooth", block: "center" });
        row?.querySelector<HTMLInputElement>('input[type="number"]')?.focus();
      }, 0);
      window.setTimeout(() => setHighlightedMaterialId(null), 2500);
      return;
    }
    setError("");
    setHighlightedMaterialId(null);
    updateLine(index, { matiere_premiere_id: materialId });
  };
  const saveDraft = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const invalidLine = form.lignes.find((line) => {
      const material = materials.find((item) => item.id === line.matiere_premiere_id);
      return !material || !isValidStockQuantity(line.quantite, material.precision_decimale);
    });
    if (invalidLine) {
      setError("Chaque quantité doit être positive et respecter la précision de son unité.");
      return;
    }
    setBusy(true);
    const payload = form.lignes.map((line) => ({
      matiere_id: line.matiere_premiere_id,
      quantite: line.quantite,
      cout_unitaire: line.cout_unitaire,
    }));
    const result = editingId
      ? await supabase.rpc("update_purchase_draft", {
          p_achat_id: editingId,
          p_fournisseur_id: form.fournisseur_id,
          p_date_achat: form.date_achat,
          p_notes: form.notes || null,
          p_lignes: payload,
        })
      : await supabase.rpc("create_purchase", {
          p_idempotency_key: purchaseKey,
          p_fournisseur_id: form.fournisseur_id,
          p_date_achat: form.date_achat,
          p_notes: form.notes || null,
          p_lignes: payload,
        });
    if (result.error)
      setError(userMessageFromError(result.error, "L’achat n’a pas pu être enregistré."));
    else {
      const id = editingId || (result.data as { achat_id: string }).achat_id;
      setEditorOpen(false);
      await load();
      await openDetail(id);
    }
    setBusy(false);
  };
  const openOperation = (kind: "receive" | "payment") => {
    setOperation(kind);
    setReceptionKey(crypto.randomUUID());
    setPayment({ montant: 0, mode: "especes", reference: "", note: "", key: crypto.randomUUID() });
    setError("");
  };
  const submitOperation = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    setBusy(true);
    setError("");
    const result =
      operation === "receive"
        ? await supabase.rpc("receive_purchase", {
            p_achat_id: detail.id,
            p_idempotency_key: receptionKey,
            p_montant_paye: payment.montant,
            p_mode_paiement: payment.montant > 0 ? payment.mode : null,
            p_payment_idempotency_key: payment.montant > 0 ? payment.key : null,
            p_reference: payment.reference || null,
            p_note: payment.note || null,
          })
        : await supabase.rpc("add_supplier_payment", {
            p_achat_id: detail.id,
            p_montant: payment.montant,
            p_mode_paiement: payment.mode,
            p_idempotency_key: payment.key,
            p_reference: payment.reference || null,
            p_note: payment.note || null,
          });
    if (result.error)
      setError(userMessageFromError(result.error, "L’opération n’a pas pu être enregistrée."));
    else {
      setOperation(null);
      await load();
      await openDetail(detail.id);
    }
    setBusy(false);
  };
  const cancel = async () => {
    if (!detail || !window.confirm("Annuler définitivement ce brouillon ?")) return;
    const { error: rpcError } = await supabase.rpc("cancel_purchase", { p_achat_id: detail.id });
    if (rpcError) setError(userMessageFromError(rpcError, "L’achat n’a pas pu être annulé."));
    else {
      await load();
      await openDetail(detail.id);
    }
  };

  return (
    <>
      <PageHeader
        title="Achats et approvisionnements"
        description="Brouillons, réceptions, règlements et dettes fournisseurs."
        action={
          <div className="flex gap-2">
            <a className="btn-secondary" href="/achats/retours">
              Retours fournisseurs
            </a>
            <button className="btn-primary" onClick={openNew}>
              <Plus size={18} />
              Nouvel achat
            </button>
          </div>
        }
      />
      <div className="card mb-5 grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-5">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
          <input
            className="field pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Numéro ou fournisseur…"
          />
        </div>
        <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="tous">Tous les statuts</option>
          <option value="brouillon">Brouillons</option>
          <option value="receptionnes">Réceptionnés</option>
          <option value="partiellement_paye">Partiellement payés</option>
          <option value="soldes">Soldés</option>
          <option value="annule">Annulés</option>
        </select>
        <select
          className="field"
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
        >
          <option value="">Tous les fournisseurs</option>
          {suppliers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nom}
            </option>
          ))}
        </select>
        <input
          className="field"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input className="field" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {error && !editorOpen && !detail && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="grid h-64 place-items-center">
            <LoaderCircle className="animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4">Numéro / Date</th>
                  <th className="px-5 py-4">Fournisseur</th>
                  <th className="px-5 py-4">Total</th>
                  <th className="px-5 py-4">Payé</th>
                  <th className="px-5 py-4">Reste</th>
                  <th className="px-5 py-4">Statut</th>
                  <th className="px-5 py-4">Réception</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-4">
                      <p className="font-bold text-brand-700">{item.numero_achat}</p>
                      <p className="text-xs text-slate-500">{item.date_achat}</p>
                    </td>
                    <td className="px-5 py-4 font-semibold">{item.fournisseur_nom}</td>
                    <td className="px-5 py-4">{formatMoney(item.total)}</td>
                    <td className="px-5 py-4 text-emerald-700">{formatMoney(item.montant_paye)}</td>
                    <td className="px-5 py-4 font-bold text-red-600">
                      {formatMoney(item.reste_a_payer)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyle[item.statut]}`}
                      >
                        {statusLabel[item.statut]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {item.date_reception ? formatDateTime(item.date_reception) : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        className="rounded-lg p-2 hover:bg-slate-100"
                        onClick={() => void openDetail(item.id)}
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <p className="p-10 text-center text-slate-500">Aucun achat trouvé.</p>
            )}
          </div>
        )}
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4">
          <form onSubmit={saveDraft} className="card my-6 w-full max-w-4xl p-6">
            <div className="mb-5 flex justify-between">
              <div>
                <p className="text-xs font-bold text-brand-600">ACHAT FOURNISSEUR</p>
                <h2 className="text-xl font-black">
                  {editingId ? "Modifier le brouillon" : "Nouvel achat"}
                </h2>
              </div>
              <button type="button" onClick={() => setEditorOpen(false)}>
                <X />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Fournisseur</label>
                <select
                  required
                  className="field"
                  value={form.fournisseur_id}
                  onChange={(e) => setForm({ ...form, fournisseur_id: e.target.value })}
                >
                  <option value="">Choisir…</option>
                  {activeSuppliers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Date d’achat</label>
                <input
                  required
                  className="field"
                  type="date"
                  value={form.date_achat}
                  onChange={(e) => setForm({ ...form, date_achat: e.target.value })}
                />
              </div>
            </div>
            <div className="my-5 space-y-3">
              <div className="flex justify-between">
                <h3 className="font-black">Matières</h3>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setForm({ ...form, lignes: [...form.lignes, newLine()] })}
                >
                  <Plus size={16} />
                  Ajouter
                </button>
              </div>
              {form.lignes.map((line, index) => {
                const material = materials.find((m) => m.id === line.matiere_premiere_id);
                return (
                  <div
                    key={index}
                    data-material-id={line.matiere_premiere_id || undefined}
                    className={`grid gap-2 rounded-xl border p-3 transition md:grid-cols-[1fr_130px_150px_140px_40px] ${highlightedMaterialId === line.matiere_premiere_id ? "border-amber-500 bg-amber-50 ring-2 ring-amber-300" : ""}`}
                  >
                    <select
                      required
                      className="field"
                      value={line.matiere_premiere_id}
                      onChange={(e) => selectMaterial(index, e.target.value)}
                    >
                      <option value="">Matière…</option>
                      {materials.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} — {item.nom}
                        </option>
                      ))}
                    </select>
                    <input
                      required
                      className="field"
                      type="number"
                      min={quantityStep(material?.precision_decimale ?? 3)}
                      step={quantityStep(material?.precision_decimale ?? 3)}
                      value={line.quantite || ""}
                      onChange={(e) => updateLine(index, { quantite: Number(e.target.value) })}
                      placeholder="Quantité"
                    />
                    <input
                      required
                      className="field"
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.cout_unitaire || ""}
                      onChange={(e) => updateLine(index, { cout_unitaire: Number(e.target.value) })}
                      placeholder="Coût unitaire"
                    />
                    <div className="grid place-items-center rounded-lg bg-slate-50 font-bold">
                      {formatMoney(purchaseLineTotal(line.quantite, line.cout_unitaire))}
                    </div>
                    <button
                      type="button"
                      disabled={form.lignes.length === 1}
                      onClick={() =>
                        setForm({ ...form, lignes: form.lignes.filter((_, i) => i !== index) })
                      }
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea
                className="field"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="my-5 flex justify-between rounded-xl bg-brand-50 p-4 text-lg font-black">
              <span>Total achat</span>
              <span>{formatMoney(total)}</span>
            </div>
            {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button disabled={busy || total <= 0} className="btn-primary w-full">
              {busy && <LoaderCircle className="animate-spin" size={18} />}Enregistrer le brouillon
            </button>
          </form>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/60">
          <button className="absolute inset-0" onClick={() => setDetail(null)} />
          <div className="relative flex h-full w-full max-w-3xl flex-col bg-white">
            <header className="flex justify-between border-b p-5">
              <div>
                <p className="text-xs font-bold text-brand-600">{detail.numero_achat}</p>
                <h2 className="text-xl font-black">{detail.fournisseur_nom}</h2>
                <p className="text-sm text-slate-500">{detail.date_achat}</p>
              </div>
              <button onClick={() => setDetail(null)}>
                <X />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Total</p>
                  <strong>{formatMoney(detail.total)}</strong>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-xs text-slate-500">Payé</p>
                  <strong>{formatMoney(detail.montant_paye)}</strong>
                </div>
                <div className="rounded-xl bg-red-50 p-3">
                  <p className="text-xs text-slate-500">Reste</p>
                  <strong>{formatMoney(detail.reste_a_payer)}</strong>
                </div>
              </div>
              <h3 className="mb-2 mt-6 font-black">Lignes</h3>
              <div className="divide-y rounded-xl border">
                {detail.lignes.map((line) => (
                  <div key={line.id} className="grid grid-cols-[1fr_auto] gap-3 p-3">
                    <div>
                      <strong>{line.nom_matiere_snapshot}</strong>
                      <p className="text-xs text-slate-500">
                        {line.quantite} {line.unite_snapshot} × {formatMoney(line.cout_unitaire)}
                      </p>
                    </div>
                    <strong>{formatMoney(Number(line.total_ligne))}</strong>
                  </div>
                ))}
              </div>
              <h3 className="mb-2 mt-6 font-black">Règlements</h3>
              {detail.paiements.length ? (
                <div className="space-y-2">
                  {detail.paiements.map((p) => (
                    <div key={p.id} className="flex justify-between rounded-xl border p-3">
                      <div>
                        <strong>{paymentLabels[p.mode_paiement]}</strong>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(p.created_at)}
                          {p.reference ? ` · ${p.reference}` : ""}
                        </p>
                      </div>
                      <strong className="text-emerald-700">{formatMoney(p.montant)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Aucun règlement.</p>
              )}
              <h3 className="mb-2 mt-6 font-black">Mouvements stock</h3>
              {detail.mouvements.length ? (
                <div className="space-y-2">
                  {detail.mouvements.map((m) => (
                    <div key={m.id} className="rounded-xl border p-3 text-sm">
                      <strong>
                        {m.matiere_nom} · +{m.quantite}
                      </strong>
                      <p className="text-xs text-slate-500">
                        Stock {m.stock_avant} → {m.stock_apres}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Aucun mouvement avant réception.</p>
              )}
              {error && (
                <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
              )}
            </div>
            <footer className="flex flex-wrap justify-end gap-2 border-t p-4">
              {detail.statut === "brouillon" && (
                <>
                  <button className="btn-secondary" onClick={editDraft}>
                    <Pencil size={18} />
                    Modifier
                  </button>
                  <button className="btn-secondary text-red-600" onClick={() => void cancel()}>
                    <Ban size={18} />
                    Annuler
                  </button>
                  <button className="btn-primary" onClick={() => openOperation("receive")}>
                    <PackageCheck size={18} />
                    Réceptionner
                  </button>
                </>
              )}
              {detail.date_reception && detail.reste_a_payer > 0 && (
                <button className="btn-primary" onClick={() => openOperation("payment")}>
                  <WalletCards size={18} />
                  Ajouter règlement
                </button>
              )}
            </footer>
          </div>
        </div>
      )}

      {operation && detail && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <form onSubmit={submitOperation} className="card w-full max-w-md p-6">
            <div className="mb-5 flex justify-between">
              <div>
                <p className="text-xs font-bold text-brand-600">{detail.numero_achat}</p>
                <h2 className="text-xl font-black">
                  {operation === "receive" ? "Réceptionner l’achat" : "Ajouter un règlement"}
                </h2>
              </div>
              <button type="button" onClick={() => setOperation(null)}>
                <X />
              </button>
            </div>
            {operation === "receive" && (
              <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                La réception augmentera définitivement le stock. Paiement immédiat facultatif.
              </p>
            )}
            <div>
              <label className="label">
                Montant payé {operation === "receive" && "(facultatif)"}
              </label>
              <input
                required={operation === "payment"}
                className="field"
                type="number"
                min={operation === "payment" ? 0.01 : 0}
                max={detail.reste_a_payer}
                step="0.01"
                value={payment.montant || ""}
                onChange={(e) => setPayment({ ...payment, montant: Number(e.target.value) })}
              />
            </div>
            <p className="mt-2 text-sm font-bold text-slate-600">
              Reste après paiement :{" "}
              {formatMoney(amountRemaining(detail.reste_a_payer, payment.montant))}
            </p>
            {(operation === "payment" || payment.montant > 0) && (
              <>
                <div className="mt-3">
                  <label className="label">Mode</label>
                  <select
                    className="field"
                    value={payment.mode}
                    onChange={(e) =>
                      setPayment({ ...payment, mode: e.target.value as SupplierPaymentMethod })
                    }
                  >
                    {Object.entries(paymentLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-3">
                  <label className="label">Référence</label>
                  <input
                    className="field"
                    value={payment.reference}
                    onChange={(e) => setPayment({ ...payment, reference: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="mt-3">
              <label className="label">Note</label>
              <textarea
                className="field"
                value={payment.note}
                onChange={(e) => setPayment({ ...payment, note: e.target.value })}
              />
            </div>
            {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button disabled={busy} className="btn-primary mt-5 w-full">
              {busy && <LoaderCircle className="animate-spin" size={18} />}Confirmer
            </button>
          </form>
        </div>
      )}
    </>
  );
}
