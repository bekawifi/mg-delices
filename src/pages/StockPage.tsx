import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Boxes,
  History,
  LoaderCircle,
  PackagePlus,
  Plus,
  Search,
  Settings2,
  Utensils,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { FormActions } from "../components/forms/FormModal";
import { supabase } from "../lib/supabase";
import { userMessageFromError } from "../lib/errors";
import { formatMoney, formatDateTime } from "../lib/format";
import { formatQuantity, isValidStockQuantity, quantityStep } from "../lib/inventory";
import type { Material, StockMovement, StockMovementType, Unit } from "../types/inventory";

type Modal = "material" | "entry" | "adjust" | "movements" | null;
const statusLabel = { normal: "Normal", stock_bas: "Stock bas", rupture: "Rupture" };
const statusStyle = {
  normal: "bg-emerald-100 text-emerald-700",
  stock_bas: "bg-amber-100 text-amber-700",
  rupture: "bg-red-100 text-red-700",
};
const movementLabel: Record<StockMovementType, string> = {
  entree: "Entrée",
  vente: "Vente",
  ajustement_positif: "Ajustement +",
  ajustement_negatif: "Ajustement −",
  perte: "Perte",
  casse: "Casse",
  inventaire: "Inventaire",
};

export function StockPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState<Modal>(null);
  const [selected, setSelected] = useState<Material | null>(null);
  const [movementType, setMovementType] = useState<"all" | StockMovementType>("all");
  const [movementFrom, setMovementFrom] = useState("");
  const [movementTo, setMovementTo] = useState("");
  const [materialForm, setMaterialForm] = useState({
    code: "",
    nom: "",
    unite_id: "",
    stock_minimum: 0,
    actif: true,
  });
  const [operation, setOperation] = useState({
    type: "ajustement_positif" as StockMovementType,
    quantite: 0,
    cout: 0,
    note: "",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    const [stock, unitResult] = await Promise.all([
      supabase.rpc("get_stock_overview"),
      supabase.from("unites").select("*").eq("actif", true).order("nom"),
    ]);
    if (stock.error) setError(userMessageFromError(stock.error, "Impossible de charger le stock."));
    else setMaterials((stock.data || []) as Material[]);
    if (!unitResult.error) setUnits((unitResult.data || []) as Unit[]);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);
  const filtered = useMemo(
    () =>
      materials.filter(
        (item) =>
          (item.nom.toLowerCase().includes(search.toLowerCase()) ||
            item.code.toLowerCase().includes(search.toLowerCase())) &&
          (filter === "all" || item.statut === filter),
      ),
    [materials, search, filter],
  );
  const summary = useMemo(
    () => ({
      value: materials.reduce((sum, item) => sum + Number(item.valeur_stock), 0),
      low: materials.filter((item) => item.statut === "stock_bas").length,
      out: materials.filter((item) => item.statut === "rupture").length,
    }),
    [materials],
  );
  const materialPrecision =
    units.find((unit) => unit.id === materialForm.unite_id)?.precision_decimale ?? 3;
  const operationStep = quantityStep(selected?.precision_decimale ?? 3);

  const openMaterial = (material?: Material) => {
    setSelected(material || null);
    setMaterialForm(
      material
        ? {
            code: material.code,
            nom: material.nom,
            unite_id: material.unite_id,
            stock_minimum: material.stock_minimum,
            actif: material.actif,
          }
        : { code: "", nom: "", unite_id: units[0]?.id || "", stock_minimum: 0, actif: true },
    );
    setModal("material");
    setError("");
  };
  const openOperation = (material: Material, type: "entry" | "adjust") => {
    setSelected(material);
    setOperation({
      type: type === "entry" ? "entree" : "ajustement_positif",
      quantite: 0,
      cout: 0,
      note: "",
    });
    setModal(type);
    setError("");
  };
  const saveMaterial = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("save_material", {
      p_id: selected?.id || null,
      p_code: materialForm.code,
      p_nom: materialForm.nom,
      p_unite_id: materialForm.unite_id,
      p_stock_minimum: materialForm.stock_minimum,
      p_actif: materialForm.actif,
    });
    if (rpcError)
      setError(userMessageFromError(rpcError, "La matière n’a pas pu être enregistrée."));
    else {
      setModal(null);
      await load();
    }
    setBusy(false);
  };
  const saveOperation = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setError("");
    if (!isValidStockQuantity(operation.quantite, selected.precision_decimale)) {
      setError(
        `Saisissez une quantité positive avec au plus ${selected.precision_decimale} décimale(s).`,
      );
      return;
    }
    setBusy(true);
    const result =
      modal === "entry"
        ? await supabase.rpc("add_stock_entry", {
            p_matiere_id: selected.id,
            p_quantite: operation.quantite,
            p_cout_unitaire: operation.cout || null,
            p_note: operation.note || null,
          })
        : await supabase.rpc("adjust_stock", {
            p_matiere_id: selected.id,
            p_type: operation.type,
            p_quantite: operation.quantite,
            p_note: operation.note || null,
          });
    if (result.error)
      setError(userMessageFromError(result.error, "Le mouvement n’a pas pu être enregistré."));
    else {
      setModal(null);
      await load();
    }
    setBusy(false);
  };
  const loadMovements = async (
    material: Material,
    type = movementType,
    from = movementFrom,
    to = movementTo,
  ) => {
    setMovements([]);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("get_stock_movements", {
      p_matiere_id: material.id,
      p_type: type === "all" ? null : type,
      p_from: from ? new Date(`${from}T00:00:00`).toISOString() : null,
      p_to: to ? new Date(`${to}T23:59:59.999`).toISOString() : null,
    });
    if (rpcError) setError(userMessageFromError(rpcError, "Impossible de charger les mouvements."));
    else setMovements((data || []) as StockMovement[]);
  };
  const openMovements = async (material: Material) => {
    setSelected(material);
    setModal("movements");
    setMovementType("all");
    setMovementFrom("");
    setMovementTo("");
    await loadMovements(material, "all", "", "");
  };

  return (
    <>
      <PageHeader
        title="Stock"
        description="Matières premières, niveaux et valorisation."
        action={
          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary" to="/stock/inventaires">
              <Boxes size={18} />
              Inventaires
            </Link>
            <Link className="btn-secondary" to="/stock/recettes">
              <Utensils size={18} />
              Fiches techniques
            </Link>
            <button className="btn-primary" onClick={() => openMaterial()}>
              <Plus size={18} />
              Nouvelle matière
            </button>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-5">
          <p className="text-sm text-slate-500">Matières actives</p>
          <p className="mt-1 text-2xl font-black">
            {materials.filter((item) => item.actif).length}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-slate-500">Valeur totale</p>
          <p className="mt-1 text-2xl font-black text-brand-700">{formatMoney(summary.value)}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-slate-500">Stock bas</p>
          <p className="mt-1 text-2xl font-black text-amber-600">{summary.low}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-slate-500">Ruptures</p>
          <p className="mt-1 text-2xl font-black text-red-600">{summary.out}</p>
        </div>
      </div>
      <div className="card my-5 grid gap-3 p-4 md:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
          <input
            className="field pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code ou matière…"
          />
        </div>
        <select className="field" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Tous les statuts</option>
          <option value="normal">Normal</option>
          <option value="stock_bas">Stock bas</option>
          <option value="rupture">Rupture</option>
        </select>
      </div>
      {error && !modal && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="grid h-64 place-items-center">
            <LoaderCircle className="animate-spin text-brand-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4">Code / Matière</th>
                  <th className="px-5 py-4">Stock actuel</th>
                  <th className="px-5 py-4">Minimum</th>
                  <th className="px-5 py-4">Coût moyen</th>
                  <th className="px-5 py-4">Valeur</th>
                  <th className="px-5 py-4">Statut</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-bold">{item.nom}</p>
                      <p className="text-xs text-slate-500">{item.code}</p>
                    </td>
                    <td className="px-5 py-4 text-base font-black">
                      {formatQuantity(item.stock_actuel, item.precision_decimale, item.unite_code)}
                    </td>
                    <td className="px-5 py-4">
                      {formatQuantity(item.stock_minimum, item.precision_decimale, item.unite_code)}
                    </td>
                    <td className="px-5 py-4">{formatMoney(item.cout_unitaire_moyen)}</td>
                    <td className="px-5 py-4 font-semibold">{formatMoney(item.valeur_stock)}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyle[item.statut]}`}
                      >
                        {statusLabel[item.statut]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <button
                          className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"
                          onClick={() => openOperation(item, "entry")}
                          title="Entrée"
                        >
                          <PackagePlus size={18} />
                        </button>
                        <button
                          className="rounded-lg p-2 text-amber-600 hover:bg-amber-50"
                          onClick={() => openOperation(item, "adjust")}
                          title="Ajustement"
                        >
                          <Settings2 size={18} />
                        </button>
                        <button
                          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                          onClick={() => void openMovements(item)}
                          title="Historique"
                        >
                          <History size={18} />
                        </button>
                        <button
                          className="rounded-lg p-2 text-brand-600 hover:bg-brand-50"
                          onClick={() => openMaterial(item)}
                          title="Modifier"
                        >
                          ✎
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <p className="p-10 text-center text-slate-500">Aucune matière trouvée.</p>
            )}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4">
          <div className="card my-6 w-full max-w-xl p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-brand-600">{selected?.nom}</p>
                <h2 className="text-xl font-black">
                  {modal === "material"
                    ? selected
                      ? "Modifier la matière"
                      : "Nouvelle matière"
                    : modal === "entry"
                      ? "Entrée de stock"
                      : modal === "adjust"
                        ? "Ajustement de stock"
                        : "Historique des mouvements"}
                </h2>
              </div>
              <button onClick={() => setModal(null)} className="p-2">
                <X />
              </button>
            </div>
            {modal === "material" && (
              <form onSubmit={saveMaterial} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Code</label>
                    <input
                      className="field"
                      required
                      value={materialForm.code}
                      onChange={(e) => setMaterialForm({ ...materialForm, code: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Unité</label>
                    <select
                      className="field"
                      required
                      value={materialForm.unite_id}
                      onChange={(e) =>
                        setMaterialForm({ ...materialForm, unite_id: e.target.value })
                      }
                    >
                      <option value="">Choisir…</option>
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Nom</label>
                  <input
                    className="field"
                    required
                    value={materialForm.nom}
                    onChange={(e) => setMaterialForm({ ...materialForm, nom: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Stock minimum</label>
                  <input
                    className="field"
                    type="number"
                    min="0"
                    step={quantityStep(materialPrecision)}
                    value={materialForm.stock_minimum}
                    onChange={(e) =>
                      setMaterialForm({ ...materialForm, stock_minimum: Number(e.target.value) })
                    }
                  />
                </div>
                <label className="flex gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={materialForm.actif}
                    onChange={(e) => setMaterialForm({ ...materialForm, actif: e.target.checked })}
                  />
                  Matière active
                </label>
                <FormActions onCancel={() => setModal(null)} busy={busy} />
              </form>
            )}
            {(modal === "entry" || modal === "adjust") && (
              <form onSubmit={saveOperation} className="space-y-4">
                {modal === "adjust" && (
                  <div>
                    <label className="label">Type</label>
                    <select
                      className="field"
                      value={operation.type}
                      onChange={(e) =>
                        setOperation({ ...operation, type: e.target.value as StockMovementType })
                      }
                    >
                      <option value="ajustement_positif">Ajustement positif</option>
                      <option value="ajustement_negatif">Ajustement négatif</option>
                      <option value="perte">Perte</option>
                      <option value="casse">Casse</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="label">Quantité ({selected?.unite_code})</label>
                  <input
                    className="field"
                    type="number"
                    min={operationStep}
                    step={operationStep}
                    required
                    value={operation.quantite || ""}
                    onChange={(e) =>
                      setOperation({ ...operation, quantite: Number(e.target.value) })
                    }
                  />
                </div>
                {modal === "entry" && (
                  <div>
                    <label className="label">Coût unitaire — facultatif</label>
                    <input
                      className="field"
                      type="number"
                      min="0"
                      value={operation.cout || ""}
                      onChange={(e) => setOperation({ ...operation, cout: Number(e.target.value) })}
                    />
                  </div>
                )}
                <div>
                  <label className="label">Note / motif</label>
                  <textarea
                    className="field"
                    required={modal === "adjust" && operation.type !== "ajustement_positif"}
                    value={operation.note}
                    onChange={(e) => setOperation({ ...operation, note: e.target.value })}
                  />
                </div>
                <FormActions onCancel={() => setModal(null)} busy={busy} submitLabel="Valider le mouvement" />
              </form>
            )}
            {modal === "movements" && (
              <div className="max-h-[65vh] overflow-y-auto">
                <div className="mb-4 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
                  <select
                    className="field"
                    value={movementType}
                    onChange={(e) => setMovementType(e.target.value as "all" | StockMovementType)}
                  >
                    <option value="all">Tous les types</option>
                    {Object.entries(movementLabel).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-secondary"
                    onClick={() => selected && void loadMovements(selected)}
                  >
                    Filtrer
                  </button>
                  <div>
                    <label className="label">Du</label>
                    <input
                      className="field"
                      type="date"
                      value={movementFrom}
                      onChange={(e) => setMovementFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Au</label>
                    <input
                      className="field"
                      type="date"
                      value={movementTo}
                      onChange={(e) => setMovementTo(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  {movements.length ? (
                    movements.map((move) => (
                      <div key={move.id} className="rounded-xl border p-3">
                        <div className="flex justify-between gap-3">
                          <div>
                            <p className="font-bold">{movementLabel[move.type_mouvement]}</p>
                            <p className="text-xs text-slate-500">
                              {formatDateTime(move.created_at)} · {move.created_by_name}
                            </p>
                          </div>
                          <strong
                            className={move.quantite > 0 ? "text-emerald-600" : "text-red-600"}
                          >
                            {move.quantite > 0 ? "+" : ""}
                            {formatQuantity(
                              move.quantite,
                              selected?.precision_decimale || 2,
                              move.unite_code,
                            )}
                          </strong>
                        </div>
                        <p className="mt-2 text-xs">
                          {formatQuantity(
                            move.stock_avant,
                            selected?.precision_decimale || 2,
                            move.unite_code,
                          )}{" "}
                          →{" "}
                          {formatQuantity(
                            move.stock_apres,
                            selected?.precision_decimale || 2,
                            move.unite_code,
                          )}
                        </p>
                        {move.reference_type && (
                          <p className="mt-1 break-all text-xs text-slate-500">
                            Référence : {move.reference_type}
                            {move.reference_id ? ` · ${move.reference_id}` : ""}
                          </p>
                        )}
                        {move.note && <p className="mt-1 text-sm text-slate-600">{move.note}</p>}
                      </div>
                    ))
                  ) : (
                    <p className="py-10 text-center text-slate-500">Aucun mouvement.</p>
                  )}
                </div>
              </div>
            )}
            {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
