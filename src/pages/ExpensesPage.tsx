import { useEffect, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { FormActions } from "../components/forms/FormModal";
import { supabase } from "../lib/supabase";
import { userMessageFromError } from "../lib/errors";
import { formatMoney } from "../lib/format";
import type { Expense, ExpenseCategory } from "../types/cash";
export function ExpensesPage() {
  const [items, setItems] = useState<Expense[]>([]),
    [cats, setCats] = useState<ExpenseCategory[]>([]),
    [stats, setStats] = useState({ jour: 0, mois: 0, nombre: 0 }),
    [modal, setModal] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filters, setFilters] = useState({ from: "", to: "", categorie: "", mode: "" }),
    [form, setForm] = useState({
      categorie: "",
      libelle: "",
      montant: 0,
      mode: "especes",
      reference: "",
      note: "",
      date: new Date().toISOString().slice(0, 10),
      key: crypto.randomUUID(),
    });
  const load = async () => {
    const [r, c] = await Promise.all([
      supabase.rpc("get_expenses_overview", {
        p_from: filters.from || null,
        p_to: filters.to || null,
        p_categorie_id: filters.categorie || null,
        p_mode: filters.mode || null,
      }),
      supabase.from("categories_depense").select("*").eq("actif", true).order("ordre"),
    ]);
    if (r.error) setError(userMessageFromError(r.error, "Impossible de charger les dépenses."));
    else {
      const d = r.data as { depenses: Expense[]; jour: number; mois: number; nombre: number };
      setItems(d.depenses);
      setStats(d);
    }
    if (!c.error) setCats(c.data as ExpenseCategory[]);
  };
  useEffect(() => {
    void load();
  }, [filters.from, filters.to, filters.categorie, filters.mode]);
  const open = () => {
    setForm({
      categorie: cats[0]?.id || "",
      libelle: "",
      montant: 0,
      mode: "especes",
      reference: "",
      note: "",
      date: new Date().toISOString().slice(0, 10),
      key: crypto.randomUUID(),
    });
    setModal(true);
    setError("");
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error: err } = await supabase.rpc("create_expense", {
      p_idempotency_key: form.key,
      p_categorie_id: form.categorie,
      p_libelle: form.libelle,
      p_montant: form.montant,
      p_mode_paiement: form.mode,
      p_reference: form.reference || null,
      p_note: form.note || null,
      p_date_depense: form.date,
    });
    if (err) setError(userMessageFromError(err, "La dépense n’a pas pu être enregistrée."));
    else {
      setModal(false);
      await load();
    }
    setBusy(false);
  };
  return (
    <>
      <PageHeader
        title="Dépenses"
        description="Dépenses d’exploitation, sans mélange avec le chiffre d’affaires."
        action={
          <button className="btn-primary" onClick={open}>
            <Plus size={18} />
            Nouvelle dépense
          </button>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-slate-500">Aujourd’hui</p>
          <b className="text-2xl">{formatMoney(stats.jour)}</b>
        </div>
        <div className="card p-5">
          <p className="text-sm text-slate-500">Ce mois</p>
          <b className="text-2xl">{formatMoney(stats.mois)}</b>
        </div>
        <div className="card p-5">
          <p className="text-sm text-slate-500">Opérations</p>
          <b className="text-2xl">{stats.nombre}</b>
        </div>
      </div>
      <div className="card mb-5 grid gap-3 p-4 md:grid-cols-4">
        <input
          className="field"
          type="date"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
        />
        <input
          className="field"
          type="date"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })}
        />
        <select
          className="field"
          value={filters.categorie}
          onChange={(e) => setFilters({ ...filters, categorie: e.target.value })}
        >
          <option value="">Toutes catégories</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={filters.mode}
          onChange={(e) => setFilters({ ...filters, mode: e.target.value })}
        >
          <option value="">Tous modes</option>
          <option value="especes">Espèces</option>
          <option value="orange_money">Orange Money</option>
          <option value="moov_money">Moov Money</option>
          <option value="virement">Virement</option>
          <option value="autre">Autre</option>
        </select>
      </div>
      {error && !modal && <p className="mb-3 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">Numéro / Date</th>
              <th>Catégorie</th>
              <th>Libellé</th>
              <th>Mode</th>
              <th>Utilisateur</th>
              <th className="pr-4 text-right">Montant</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((x) => (
              <tr key={x.id}>
                <td className="p-4">
                  <b>{x.numero_depense}</b>
                  <p className="text-xs text-slate-500">{x.date_depense}</p>
                </td>
                <td>{x.categorie_nom}</td>
                <td>{x.libelle}</td>
                <td>{x.mode_paiement}</td>
                <td>{x.created_by_name}</td>
                <td className="pr-4 text-right font-bold">{formatMoney(x.montant)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <form onSubmit={save} className="card w-full max-w-lg space-y-4 p-6">
            <div className="flex justify-between">
              <h2 className="text-xl font-black">Nouvelle dépense</h2>
              <button type="button" onClick={() => setModal(false)}>
                <X />
              </button>
            </div>
            <select
              required
              className="field"
              value={form.categorie}
              onChange={(e) => setForm({ ...form, categorie: e.target.value })}
            >
              <option value="">Catégorie…</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
            <input
              required
              className="field"
              placeholder="Libellé"
              value={form.libelle}
              onChange={(e) => setForm({ ...form, libelle: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                className="field"
                type="number"
                min="1"
                value={form.montant || ""}
                onChange={(e) => setForm({ ...form, montant: Number(e.target.value) })}
              />
              <select
                className="field"
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value })}
              >
                <option value="especes">Espèces</option>
                <option value="orange_money">Orange Money</option>
                <option value="moov_money">Moov Money</option>
                <option value="virement">Virement</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <input
              className="field"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
            <input
              className="field"
              placeholder="Référence"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
            <textarea
              className="field"
              placeholder="Note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
            {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="-mx-6 -mb-6 mt-1"><FormActions onCancel={() => setModal(false)} busy={busy} /></div>
          </form>
        </div>
      )}
    </>
  );
}
