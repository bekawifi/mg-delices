import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Edit3, LoaderCircle, Plus, Search } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { FormModal } from "../components/forms/FormModal";
import { FormField, ToggleField } from "../components/forms/FormField";
import { ImagePicker } from "../components/forms/ImagePicker";
import { supabase } from "../lib/supabase";
import { formatMoney } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { userMessageFromError } from "../lib/errors";
import { removeOwnedProductImage, uploadProductImage } from "../lib/productImages";
import type { Category, Product } from "../types/database";

const blank = { nom: "", categorie_id: "", description: "", prix_vente: 0, cout_estime: 0, image_url: "", disponible: true };
type FormState = typeof blank;

export function ProductManagementPage() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "gestionnaire";
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    const [productResult, categoryResult] = await Promise.all([
      supabase.from("produits").select("*, categories(nom)").order("nom"),
      supabase.from("categories").select("*").order("ordre").order("nom"),
    ]);
    if (productResult.error) setError(userMessageFromError(productResult.error, "Impossible de charger les produits."));
    else setProducts((productResult.data || []) as Product[]);
    if (!categoryResult.error) setCategories((categoryResult.data || []) as Category[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => products.filter((product) => product.nom.toLowerCase().includes(search.toLowerCase()) && (category === "all" || product.categorie_id === category)), [products, search, category]);
  const close = () => { if (!saving) setModal(false); };
  const openCreate = () => { setEditing(null); setForm({ ...blank }); setImageFile(null); setError(""); setModal(true); };
  const openEdit = (product: Product) => {
    setEditing(product);
    setForm({ nom: product.nom, categorie_id: product.categorie_id || "", description: product.description || "", prix_vente: Number(product.prix_vente), cout_estime: Number(product.cout_estime), image_url: product.image_url || "", disponible: product.disponible });
    setImageFile(null); setError(""); setModal(true);
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    if (form.image_url.trim().startsWith("data:")) {
      setError("Les images base64 ne peuvent pas être enregistrées. Choisissez un fichier ou saisissez une URL.");
      setSaving(false);
      return;
    }
    const productId = editing?.id || crypto.randomUUID();
    let uploaded: { url: string; path: string } | null = null;
    try {
      if (imageFile) uploaded = await uploadProductImage(productId, imageFile);
      const imageUrl = uploaded?.url || form.image_url.trim() || null;
      const payload = { ...form, nom: form.nom.trim(), categorie_id: form.categorie_id || null, description: form.description.trim() || null, image_url: imageUrl };
      const result = editing
        ? await supabase.from("produits").update(payload).eq("id", editing.id)
        : await supabase.from("produits").insert({ ...payload, id: productId });
      if (result.error) throw result.error;
      const previousUrl = editing?.image_url || "";
      if (previousUrl && previousUrl !== imageUrl) {
        try { await removeOwnedProductImage(previousUrl); } catch { /* Le produit reste valide; nettoyage réessayable. */ }
      }
      setModal(false);
      await load();
    } catch (caught) {
      if (uploaded) {
        try { await removeOwnedProductImage(uploaded.url); } catch { /* Ne masque pas l'erreur principale. */ }
      }
      setError(userMessageFromError(caught, "Le produit ou son image n’a pas pu être enregistré."));
    }
    setSaving(false);
  };
  const toggle = async (product: Product) => {
    const { error: updateError } = await supabase.from("produits").update({ disponible: !product.disponible }).eq("id", product.id);
    if (updateError) setError(userMessageFromError(updateError, "La disponibilité n’a pas pu être modifiée.")); else await load();
  };

  return <>
    <PageHeader title="Menu / Produits" description="Gérez les articles proposés à la vente." action={canEdit && <button className="btn-primary" onClick={openCreate}><Plus size={19} />Nouveau produit</button>} />
    <div className="card mb-5 grid gap-3 p-4 md:grid-cols-[1fr_260px]"><div className="relative"><Search className="absolute left-3 top-3.5 text-slate-400" size={18} /><input className="field pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un produit…" /></div><select className="field" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Toutes les catégories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.nom}</option>)}</select></div>
    {error && !modal && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="card overflow-hidden">{loading ? <div className="grid min-h-60 place-items-center"><LoaderCircle className="animate-spin text-brand-600" /></div> : filtered.length === 0 ? <EmptyState title="Aucun produit" message="Créez un produit ou modifiez vos filtres." /> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Produit</th><th className="px-5 py-4">Catégorie</th><th className="px-5 py-4">Prix</th><th className="px-5 py-4">Coût</th><th className="px-5 py-4">Disponibilité</th>{canEdit && <th className="px-5 py-4 text-right">Action</th>}</tr></thead><tbody className="divide-y">{filtered.map((product) => <tr key={product.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><div className="flex items-center gap-3">{product.image_url ? <img src={product.image_url} alt="" className="h-11 w-11 rounded-lg border object-cover" /> : <div className="h-11 w-11 rounded-lg bg-slate-100" />}<div><div className="font-bold">{product.nom}</div>{product.description && <div className="max-w-xs truncate text-xs text-slate-500">{product.description}</div>}</div></div></td><td className="px-5 py-4 text-slate-600">{product.categories?.nom || "Sans catégorie"}</td><td className="px-5 py-4 font-semibold">{formatMoney(product.prix_vente)}</td><td className="px-5 py-4 text-slate-600">{formatMoney(product.cout_estime)}</td><td className="px-5 py-4"><button disabled={!canEdit} onClick={() => void toggle(product)} className={`rounded-full px-3 py-1 text-xs font-bold ${product.disponible ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{product.disponible ? "Disponible" : "Indisponible"}</button></td>{canEdit && <td className="px-5 py-4 text-right"><button onClick={() => openEdit(product)} className="rounded-lg p-2 text-brand-600 hover:bg-brand-50" aria-label={`Modifier ${product.nom}`}><Edit3 size={18} /></button></td>}</tr>)}</tbody></table></div>}</div>
    {modal && <FormModal title={editing ? "Modifier le produit" : "Nouveau produit"} eyebrow="Produit" onClose={close} onSubmit={save} busy={saving} error={error} submitDisabled={!form.nom.trim()}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Nom" htmlFor="product-name" required><input id="product-name" autoFocus className="field" value={form.nom} onChange={(event) => setForm({ ...form, nom: event.target.value })} required /></FormField>
        <FormField label="Catégorie" htmlFor="product-category"><select id="product-category" className="field" value={form.categorie_id} onChange={(event) => setForm({ ...form, categorie_id: event.target.value })}><option value="">Sans catégorie</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.nom}</option>)}</select></FormField>
        <FormField label="Prix de vente" htmlFor="product-price" required><input id="product-price" className="field" type="number" min="0" step="1" value={form.prix_vente} onChange={(event) => setForm({ ...form, prix_vente: Number(event.target.value) })} required /></FormField>
        <FormField label="Coût estimé" htmlFor="product-cost"><input id="product-cost" className="field" type="number" min="0" step="1" value={form.cout_estime} onChange={(event) => setForm({ ...form, cout_estime: Number(event.target.value) })} /></FormField>
        <FormField label="Description" htmlFor="product-description" className="sm:col-span-2"><textarea id="product-description" className="field" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></FormField>
        <div className="sm:col-span-2"><ImagePicker value={form.image_url} file={imageFile} onUrlChange={(image_url) => { setImageFile(null); setForm({ ...form, image_url }); }} onFileChange={(file) => setImageFile(file)} onRemove={() => { setImageFile(null); setForm({ ...form, image_url: "" }); }} disabled={saving} /></div>
        <div className="sm:col-span-2"><ToggleField label="Disponible à la vente" description="Le produit peut être sélectionné dans la caisse et les commandes." checked={form.disponible} onChange={(disponible) => setForm({ ...form, disponible })} disabled={saving} /></div>
      </div>
    </FormModal>}
  </>;
}
