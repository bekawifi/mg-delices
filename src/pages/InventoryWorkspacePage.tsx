import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, ClipboardCheck, LoaderCircle, Plus, Save, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../lib/supabase";
import { userMessageFromError } from "../lib/errors";
import { formatDateTime, formatMoney } from "../lib/format";
import { formatQuantity, inventoryDifference, isValidStockQuantity, matchesInventoryLineFilter, parseInventoryQuantity, quantityStep } from "../lib/inventory";
import type { InventoryDetail, InventoryLine } from "../types/inventory";

interface InventoryRow {
  id: string; numero: string; statut: "brouillon" | "valide"; note: string | null;
  created_at: string; validated_at: string | null; utilisateur: string; nombre_matieres: number;
  stock_theorique: number; stock_physique: number | null; ecart: number | null; valeur_ecart: number | null;
}
type SheetFilter = "all" | "differences" | "uncounted" | "low";
type LineTextState = Record<string, string>;
const REASONS = [
  ["", "Aucun"], ["perte", "Perte"], ["casse", "Casse"], ["peremption", "Péremption"],
  ["erreur_saisie", "Erreur de saisie"], ["consommation_non_enregistree", "Consommation non enregistrée"],
  ["surplus", "Surplus"], ["autre", "Autre"],
] as const;

function differenceFor(line: InventoryLine, raw: string) {
  const count = parseInventoryQuantity(raw);
  return count === null || Number.isNaN(count) ? null : inventoryDifference(count, Number(line.stock_theorique));
}
function Difference({ line, raw }: { line: InventoryLine; raw: string }) {
  const difference = differenceFor(line, raw);
  if (difference === null) return <span className="font-semibold text-amber-700">Non compté</span>;
  const color = difference > 0 ? "text-emerald-700" : difference < 0 ? "text-red-700" : "text-slate-500";
  return <span className={`font-bold ${color}`}>{difference > 0 ? "+" : ""}{formatQuantity(difference, line.precision_decimale)}</span>;
}

export function InventoryWorkspacePage() {
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [detail, setDetail] = useState<InventoryDetail | null>(null);
  const [counts, setCounts] = useState<LineTextState>({});
  const [reasons, setReasons] = useState<LineTextState>({});
  const [comments, setComments] = useState<LineTextState>({});
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [sheetFilter, setSheetFilter] = useState<SheetFilter>("all");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userFilter, setUserFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    const { data, error: readError } = await supabase.rpc("get_inventories_overview");
    if (readError) setError(userMessageFromError(readError, "Impossible de charger les inventaires."));
    else setItems((data || []) as InventoryRow[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  const users = useMemo(() => [...new Set(items.map((item) => item.utilisateur))].sort(), [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const day = item.created_at.slice(0, 10);
    return (status === "all" || item.statut === status) && (userFilter === "all" || item.utilisateur === userFilter)
      && (!from || day >= from) && (!to || day <= to);
  }), [items, status, userFilter, from, to]);

  const setLoadedDetail = (loaded: InventoryDetail) => {
    setDetail(loaded);
    setCounts(Object.fromEntries(loaded.lignes.map((line) => [line.matiere_id, line.quantite_comptee == null ? "" : String(line.quantite_comptee)])));
    setReasons(Object.fromEntries(loaded.lignes.map((line) => [line.matiere_id, line.motif || ""])));
    setComments(Object.fromEntries(loaded.lignes.map((line) => [line.matiere_id, line.commentaire || ""])));
    setNote(loaded.note || ""); setQuery(""); setSheetFilter("all");
  };
  const open = async (id: string) => {
    setDetailLoading(true); setError("");
    const { data, error: rpcError } = await supabase.rpc("get_inventory_detail", { p_inventaire_id: id });
    if (rpcError) setError(userMessageFromError(rpcError, "Impossible de charger l’inventaire."));
    else setLoadedDetail(data as InventoryDetail);
    setDetailLoading(false);
  };
  const create = async () => {
    setBusy(true); setError("");
    const { data, error: rpcError } = await supabase.rpc("create_inventory", { p_note: null });
    if (rpcError) setError(userMessageFromError(rpcError, "Impossible de créer l’inventaire."));
    else { await load(); await open(data as string); }
    setBusy(false);
  };
  const invalidLine = detail?.lignes.find((line) => {
    const quantity = parseInventoryQuantity(counts[line.matiere_id] ?? "");
    return quantity !== null && !isValidStockQuantity(quantity, line.precision_decimale, true);
  });
  const saveDraft = async (showSuccess = true) => {
    if (!detail || detail.statut !== "brouillon") return false;
    if (invalidLine) {
      setError(`La quantité de ${invalidLine.matiere_nom} est invalide ou ne respecte pas la précision de son unité.`);
      return false;
    }
    setBusy(true); setError(""); setSuccess("");
    const lines = detail.lignes.map((line) => ({
      matiere_id: line.matiere_id, quantite_comptee: parseInventoryQuantity(counts[line.matiere_id] ?? ""),
      motif: reasons[line.matiere_id] || null, commentaire: comments[line.matiere_id]?.trim() || null,
    }));
    const { error: rpcError } = await supabase.rpc("save_inventory_draft", {
      p_inventaire_id: detail.id, p_note: note, p_lignes: lines,
    });
    if (rpcError) {
      setError(userMessageFromError(rpcError, "Le brouillon n’a pas pu être sauvegardé.")); setBusy(false); return false;
    }
    await open(detail.id); await load();
    if (showSuccess) setSuccess("Brouillon sauvegardé.");
    setBusy(false); return true;
  };
  const validate = async () => {
    if (!detail) return;
    const missing = detail.lignes.filter((line) => parseInventoryQuantity(counts[line.matiere_id] ?? "") === null);
    if (missing.length) { setSheetFilter("uncounted"); setError(`Validation impossible : ${missing.length} matière(s) restent à compter.`); return; }
    if (!window.confirm("Valider définitivement cet inventaire et appliquer les écarts au stock ? Cette action est irréversible.")) return;
    const saved = await saveDraft(false);
    if (!saved) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("validate_inventory", { p_inventaire_id: detail.id });
    if (rpcError) setError(userMessageFromError(rpcError, "L’inventaire n’a pas pu être validé."));
    else { await load(); await open(detail.id); setSuccess("Inventaire validé et écarts appliqués au stock."); }
    setBusy(false);
  };
  const counted = detail?.lignes.filter((line) => parseInventoryQuantity(counts[line.matiere_id] ?? "") !== null).length ?? 0;
  const visibleLines = useMemo(() => {
    if (!detail) return [];
    return detail.lignes.filter((line) => matchesInventoryLineFilter(line, counts[line.matiere_id] ?? "", query, sheetFilter));
  }, [detail, query, sheetFilter, counts]);

  if (detail) {
    const readOnly = detail.statut === "valide";
    return <div className="-m-4 min-h-full bg-slate-50 p-4 md:-m-6 md:p-6 xl:-m-8 xl:p-8"><div className="mx-auto max-w-[1800px]">
      <button className="mb-4 inline-flex items-center gap-2 font-semibold text-slate-600 hover:text-slate-900" onClick={() => { setDetail(null); setError(""); setSuccess(""); }}><ArrowLeft size={18} /> Retour aux inventaires</button>
      <section className="card mb-5 overflow-hidden">
        <div className="flex flex-col gap-5 p-5 xl:flex-row xl:items-start xl:justify-between">
          <div><p className="text-xs font-black tracking-[0.18em] text-brand-600">INVENTAIRE</p><div className="mt-1 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-black">{detail.numero}</h1><span className={`rounded-full px-3 py-1 text-xs font-bold ${readOnly ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{readOnly ? "Validé" : "Brouillon"}</span></div></div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-4"><div><dt className="text-slate-500">Date</dt><dd className="font-bold">{formatDateTime(detail.created_at)}</dd></div><div><dt className="text-slate-500">Créé par</dt><dd className="font-bold">{detail.utilisateur}</dd></div><div><dt className="text-slate-500">Nombre</dt><dd className="font-bold">{detail.lignes.length} matières</dd></div><div><dt className="text-slate-500">Progression</dt><dd className="font-bold">{counted} / {detail.lignes.length}</dd></div></dl>
        </div>
        <div className="h-2 bg-slate-100"><div className="h-full bg-brand-500 transition-all" style={{ width: `${detail.lignes.length ? counted / detail.lignes.length * 100 : 0}%` }} /></div>
        {readOnly && <div className="flex items-center gap-2 border-t bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-800"><CheckCircle2 size={18} /> Inventaire validé et immuable{detail.validated_at ? ` le ${formatDateTime(detail.validated_at)}` : ""}.</div>}
      </section>
      <section className="card mb-5 p-4"><label className="label" htmlFor="inventory-note">Note générale</label><textarea id="inventory-note" className="field min-h-20 resize-y" placeholder="Contexte ou remarque générale sur ce comptage…" value={note} disabled={readOnly} onChange={(event) => setNote(event.target.value)} /></section>
      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between"><div className="relative w-full max-w-lg"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input className="field py-2.5 pl-10" placeholder="Rechercher par code ou matière" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="flex flex-wrap gap-2">{([['all', 'Tous'], ['differences', 'Écarts uniquement'], ['uncounted', 'Non comptés'], ['low', 'Stock faible']] as const).map(([value, label]) => <button key={value} onClick={() => setSheetFilter(value)} className={`rounded-lg px-3 py-2 text-sm font-bold transition ${sheetFilter === value ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>)}</div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1220px] border-collapse text-sm"><thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-28 px-3 py-3">Code</th><th className="min-w-48 px-3 py-3">Matière / ingrédient</th><th className="w-20 px-3 py-3">Unité</th><th className="w-32 px-3 py-3 text-right">Théorique</th><th className="w-40 px-3 py-3 text-right">Stock physique</th><th className="w-28 px-3 py-3 text-right">Écart</th><th className="w-56 px-3 py-3">Motif</th><th className="min-w-64 px-3 py-3">Commentaire</th></tr></thead>
          <tbody className="divide-y">{visibleLines.map((line) => { const raw = counts[line.matiere_id] ?? ""; const uncounted = parseInventoryQuantity(raw) === null; return <tr key={line.id} className={uncounted ? "bg-amber-50/70" : "bg-white hover:bg-slate-50"}>
            <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{line.matiere_code}</td><td className="px-3 py-2.5"><div className="font-bold text-slate-900">{line.matiere_nom}</div>{uncounted && <div className="mt-0.5 text-xs font-semibold text-amber-700">À compter</div>}</td><td className="px-3 py-2.5 text-slate-600">{line.unite_code}</td><td className="px-3 py-2.5 text-right font-semibold">{formatQuantity(Number(line.stock_theorique), line.precision_decimale)}</td>
            <td className="px-3 py-2.5"><input aria-label={`Stock physique ${line.matiere_nom}`} className={`field h-10 px-3 py-2 text-right font-bold ${uncounted ? "border-amber-300 bg-amber-50" : ""}`} type="number" min="0" step={quantityStep(line.precision_decimale)} value={raw} disabled={readOnly} placeholder="Non compté" onChange={(event) => setCounts((current) => ({ ...current, [line.matiere_id]: event.target.value }))} /></td><td className="px-3 py-2.5 text-right"><Difference line={line} raw={raw} /></td>
            <td className="px-3 py-2.5"><select aria-label={`Motif ${line.matiere_nom}`} className="field h-10 px-2 py-1.5" value={reasons[line.matiere_id] ?? ""} disabled={readOnly} onChange={(event) => setReasons((current) => ({ ...current, [line.matiere_id]: event.target.value }))}>{REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td className="px-3 py-2.5"><input aria-label={`Commentaire ${line.matiere_nom}`} className="field h-10 px-3 py-2" value={comments[line.matiere_id] ?? ""} disabled={readOnly} placeholder="Précision facultative" onChange={(event) => setComments((current) => ({ ...current, [line.matiere_id]: event.target.value }))} /></td>
          </tr>; })}</tbody></table>{!visibleLines.length && <div className="p-10 text-center text-slate-500">Aucune matière ne correspond à ces critères.</div>}</div>
        <div className="border-t bg-slate-50 px-4 py-3 text-sm text-slate-500">{visibleLines.length} ligne(s) affichée(s) sur {detail.lignes.length}. Les saisies sont conservées lorsque vous changez de filtre.</div>
      </section>
      {(error || success) && <div className={`mt-4 rounded-xl p-3 text-sm font-semibold ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{error || success}</div>}
      <footer className="sticky bottom-0 z-20 mt-5 flex flex-col gap-3 border-t bg-white/95 p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between"><button className="btn-secondary" onClick={() => { setDetail(null); setError(""); setSuccess(""); }}><ArrowLeft size={18} /> Retour</button>{!readOnly && <div className="flex flex-col gap-2 sm:flex-row"><button className="btn-secondary" disabled={busy} onClick={() => void saveDraft()}>{busy ? <LoaderCircle className="animate-spin" size={18} /> : <Save size={18} />} Sauvegarder</button><button className="btn-primary" disabled={busy} onClick={() => void validate()}><CheckCircle2 size={18} /> Valider l’inventaire</button></div>}</footer>
    </div></div>;
  }

  return <><PageHeader title="Inventaires physiques" description="Comptez les matières, sauvegardez le brouillon puis validez les écarts." action={<div className="flex gap-2"><Link to="/stock" className="btn-secondary"><ArrowLeft size={18} /> Retour</Link><button onClick={() => void create()} className="btn-primary" disabled={busy}><Plus size={18} /> Nouvel inventaire</button></div>} />
    <div className="card mb-5 grid gap-3 p-4 md:grid-cols-4"><select className="field" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Tous les statuts</option><option value="brouillon">Brouillons</option><option value="valide">Validés</option></select><select className="field" value={userFilter} onChange={(event) => setUserFilter(event.target.value)}><option value="all">Tous les utilisateurs</option>{users.map((user) => <option key={user}>{user}</option>)}</select><input className="field" type="date" aria-label="Du" value={from} onChange={(event) => setFrom(event.target.value)} /><input className="field" type="date" aria-label="Au" value={to} onChange={(event) => setTo(event.target.value)} /></div>
    {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="card overflow-hidden">{loading || detailLoading ? <div className="grid h-60 place-items-center"><LoaderCircle className="animate-spin" /></div> : filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Référence</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Créé par</th><th className="px-4 py-3 text-right">Matières</th><th className="px-4 py-3 text-right">Théorique</th><th className="px-4 py-3 text-right">Physique</th><th className="px-4 py-3 text-right">Écart global</th><th className="px-4 py-3">Statut</th><th className="w-10" /></tr></thead><tbody className="divide-y">{filtered.map((item) => <tr key={item.id} className="cursor-pointer bg-white hover:bg-slate-50" onClick={() => void open(item.id)}><td className="px-4 py-4 font-black">{item.numero}</td><td className="px-4 py-4 text-slate-600">{formatDateTime(item.created_at)}</td><td className="px-4 py-4">{item.utilisateur}</td><td className="px-4 py-4 text-right font-semibold">{item.nombre_matieres}</td><td className="px-4 py-4 text-right">{Number(item.stock_theorique).toLocaleString("fr-FR")}</td><td className="px-4 py-4 text-right">{item.stock_physique == null ? "—" : Number(item.stock_physique).toLocaleString("fr-FR")}</td><td className="px-4 py-4 text-right"><div className="font-bold">{item.ecart == null ? "—" : Number(item.ecart).toLocaleString("fr-FR")}</div><div className="text-xs text-slate-500">{item.valeur_ecart == null ? "" : formatMoney(Number(item.valeur_ecart))}</div></td><td className="px-4 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.statut === "valide" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{item.statut === "valide" ? "Validé" : "Brouillon"}</span></td><td className="pr-4 text-brand-600"><ChevronRight size={18} /></td></tr>)}</tbody></table></div> : <div className="grid h-60 place-items-center text-center"><div><ClipboardCheck className="mx-auto text-slate-300" size={44} /><p className="mt-3 font-bold">Aucun inventaire</p></div></div>}</div>
  </>;
}
