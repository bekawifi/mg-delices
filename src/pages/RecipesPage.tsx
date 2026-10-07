import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, LoaderCircle, Plus, Search, Utensils, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { userMessageFromError } from '../lib/errors'
import { formatMoney } from '../lib/format'
import { formatQuantity } from '../lib/inventory'
import type { Material, RecipeOverview } from '../types/inventory'

export function RecipesPage() {
  const [recipes, setRecipes] = useState<RecipeOverview[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<RecipeOverview | null>(null)
  const [name, setName] = useState('')
  const [yieldQty, setYieldQty] = useState(1)
  const [ingredients, setIngredients] = useState<Record<string, number>>({})
  const load = async () => {
    setLoading(true)
    const [r, m] = await Promise.all([supabase.rpc('get_recipes_overview'), supabase.rpc('get_stock_overview')])
    if (r.error || m.error) setError(userMessageFromError(r.error || m.error, 'Impossible de charger les fiches techniques.'))
    else { setRecipes((r.data || []) as RecipeOverview[]); setMaterials(((m.data || []) as Material[]).filter(item => item.actif)) }
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const open = (recipe: RecipeOverview) => {
    setEditing(recipe); setName(recipe.recette_nom || `${recipe.produit_nom} standard`); setYieldQty(recipe.rendement_quantite || 1)
    setIngredients(Object.fromEntries(recipe.ingredients.map(item => [item.matiere_id, item.quantite]))); setError('')
  }
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!editing) return
    setBusy(true); setError('')
    const { error: rpcError } = await supabase.rpc('save_recipe', { p_produit_id: editing.produit_id, p_nom: name, p_rendement: yieldQty, p_ingredients: Object.entries(ingredients).filter(([, quantity]) => quantity > 0).map(([matiere_id, quantite]) => ({ matiere_id, quantite })) })
    if (rpcError) setError(userMessageFromError(rpcError, 'La fiche technique n’a pas pu être enregistrée.'))
    else { setEditing(null); await load() }
    setBusy(false)
  }
  const filtered = recipes.filter(item => item.produit_nom.toLowerCase().includes(search.toLowerCase()))
  return <>
    <PageHeader title="Fiches techniques" description="Recettes, coûts matières et marges brutes estimées." action={<Link to="/stock" className="btn-secondary"><ArrowLeft size={18}/>Retour au stock</Link>}/>
    <div className="card mb-5 p-4"><div className="relative"><Search className="absolute left-3 top-3.5 text-slate-400" size={18}/><input className="field pl-10" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un produit…"/></div></div>
    {error && !editing && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <div className="grid h-64 place-items-center"><LoaderCircle className="animate-spin text-brand-600"/></div> : <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{filtered.map(recipe => <article key={recipe.produit_id} className="card p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">{recipe.produit_nom}</h2><p className="text-sm text-slate-500">Prix de vente : {formatMoney(recipe.prix_vente)}</p></div><button onClick={() => open(recipe)} className="btn-secondary min-h-9 px-3 py-1.5 text-sm">{recipe.recette_id ? 'Modifier' : <><Plus size={16}/>Créer</>}</button></div>{recipe.recette_id ? <><p className="mt-4 text-sm font-bold text-brand-700">{recipe.recette_nom}</p><div className="mt-2 space-y-2">{recipe.ingredients.map(item => <div key={item.matiere_id} className="flex justify-between text-sm"><span>{item.matiere_nom} · {formatQuantity(item.quantite / (recipe.rendement_quantite || 1), 3, item.unite_code)}</span><span>{formatMoney(item.quantite * item.cout_unitaire / (recipe.rendement_quantite || 1))}</span></div>)}</div><div className="mt-4 space-y-1 border-t pt-3 text-sm"><div className="flex justify-between"><span>Coût matières estimé</span><strong>{formatMoney(recipe.cout_matieres)}</strong></div><div className="flex justify-between text-brand-700"><span>Marge brute estimée</span><strong>{formatMoney(recipe.prix_vente - recipe.cout_matieres)}</strong></div></div></> : <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">Produit sans fiche technique</div>}</article>)}</div>}

    {editing && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4"><div className="card my-6 w-full max-w-2xl p-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase text-brand-600">{editing.produit_nom}</p><h2 className="text-xl font-black">Fiche technique</h2></div><button onClick={() => setEditing(null)} className="p-2"><X/></button></div><form onSubmit={save} className="space-y-4"><div className="grid gap-3 sm:grid-cols-[1fr_150px]"><div><label className="label">Nom de la recette</label><input className="field" value={name} onChange={e => setName(e.target.value)}/></div><div><label className="label">Rendement</label><input className="field" type="number" min="0.000001" step="0.001" value={yieldQty} onChange={e => setYieldQty(Number(e.target.value))}/></div></div><div><p className="label">Ingrédients pour ce rendement</p><div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border p-3">{materials.map(material => <div key={material.id} className="grid grid-cols-[1fr_150px] items-center gap-3"><div><p className="font-semibold">{material.nom}</p><p className="text-xs text-slate-500">{material.unite_code} · {formatMoney(material.cout_unitaire_moyen)}/unité</p></div><div className="relative"><input className="field py-2 pr-12 text-right" type="number" min="0" step="0.001" value={ingredients[material.id] || ''} onChange={e => setIngredients({...ingredients, [material.id]: Number(e.target.value)})}/><span className="absolute right-3 top-2.5 text-xs text-slate-500">{material.unite_code}</span></div></div>)}</div></div>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button className="btn-primary w-full" disabled={busy || !Object.values(ingredients).some(value => value > 0)}>{busy ? <LoaderCircle className="animate-spin"/> : <Utensils/>}Enregistrer la fiche technique</button></form></div></div>}
  </>
}
