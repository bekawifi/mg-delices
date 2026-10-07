import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Edit3, LoaderCircle, Plus, Search, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { supabase } from '../lib/supabase'
import { formatMoney } from '../lib/format'
import { useAuth } from '../contexts/AuthContext'
import { userMessageFromError } from '../lib/errors'
import type { Category, Product } from '../types/database'

const blank = { nom: '', categorie_id: '', description: '', prix_vente: 0, cout_estime: 0, image_url: '', disponible: true }
type FormState = typeof blank

export function ProductsPage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'gestionnaire'
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<FormState>(blank)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const [productResult, categoryResult] = await Promise.all([
      supabase.from('produits').select('*, categories(nom)').order('nom'),
      supabase.from('categories').select('*').order('ordre').order('nom'),
    ])
    if (productResult.error) setError(userMessageFromError(productResult.error, 'Impossible de charger les produits.'))
    else setProducts((productResult.data || []) as Product[])
    if (!categoryResult.error) setCategories((categoryResult.data || []) as Category[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => products.filter(product => {
    const matchText = product.nom.toLowerCase().includes(search.toLowerCase())
    return matchText && (category === 'all' || product.categorie_id === category)
  }), [products, search, category])

  const openCreate = () => { setEditing(null); setForm(blank); setError(''); setModal(true) }
  const openEdit = (product: Product) => {
    setEditing(product); setForm({ nom: product.nom, categorie_id: product.categorie_id || '', description: product.description || '', prix_vente: product.prix_vente, cout_estime: product.cout_estime, image_url: product.image_url || '', disponible: product.disponible }); setError(''); setModal(true)
  }
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    const payload = { ...form, categorie_id: form.categorie_id || null, description: form.description || null, image_url: form.image_url || null }
    const result = editing ? await supabase.from('produits').update(payload).eq('id', editing.id) : await supabase.from('produits').insert(payload)
    if (result.error) setError(userMessageFromError(result.error, 'Le produit n’a pas pu être enregistré.'))
    else { setModal(false); await load() }
    setSaving(false)
  }
  const toggle = async (product: Product) => {
    const { error: updateError } = await supabase.from('produits').update({ disponible: !product.disponible }).eq('id', product.id)
    if (updateError) setError(userMessageFromError(updateError, 'La disponibilité n’a pas pu être modifiée.')); else await load()
  }

  return <>
    <PageHeader title="Menu / Produits" description="Gérez les articles proposés à la vente." action={canEdit && <button className="btn-primary" onClick={openCreate}><Plus size={19}/>Nouveau produit</button>} />
    <div className="card mb-5 grid gap-3 p-4 md:grid-cols-[1fr_260px]">
      <div className="relative"><Search className="absolute left-3 top-3.5 text-slate-400" size={18}/><input className="field pl-10" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un produit…" /></div>
      <select className="field" value={category} onChange={e => setCategory(e.target.value)}><option value="all">Toutes les catégories</option>{categories.map(item => <option key={item.id} value={item.id}>{item.nom}</option>)}</select>
    </div>
    {error && !modal && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="card overflow-hidden">
      {loading ? <div className="grid min-h-60 place-items-center"><LoaderCircle className="animate-spin text-brand-600"/></div> : filtered.length === 0 ? <EmptyState title="Aucun produit" message="Créez un produit ou modifiez vos filtres."/> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Nom</th><th className="px-5 py-4">Catégorie</th><th className="px-5 py-4">Prix</th><th className="px-5 py-4">Coût</th><th className="px-5 py-4">Disponibilité</th>{canEdit && <th className="px-5 py-4 text-right">Action</th>}</tr></thead>
        <tbody className="divide-y">{filtered.map(product => <tr key={product.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><div className="font-bold">{product.nom}</div>{product.description && <div className="max-w-xs truncate text-xs text-slate-500">{product.description}</div>}</td><td className="px-5 py-4 text-slate-600">{product.categories?.nom || 'Sans catégorie'}</td><td className="px-5 py-4 font-semibold">{formatMoney(product.prix_vente)}</td><td className="px-5 py-4 text-slate-600">{formatMoney(product.cout_estime)}</td><td className="px-5 py-4"><button disabled={!canEdit} onClick={() => toggle(product)} className={`rounded-full px-3 py-1 text-xs font-bold ${product.disponible ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{product.disponible ? 'Disponible' : 'Indisponible'}</button></td>{canEdit && <td className="px-5 py-4 text-right"><button onClick={() => openEdit(product)} className="rounded-lg p-2 text-brand-600 hover:bg-brand-50" aria-label={`Modifier ${product.nom}`}><Edit3 size={18}/></button></td>}</tr>)}</tbody>
      </table></div>}
    </div>
    {modal && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4"><div className="card my-6 w-full max-w-2xl p-6"><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-black">{editing ? 'Modifier le produit' : 'Nouveau produit'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-2 hover:bg-slate-100"><X/></button></div><form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <div><label className="label">Nom *</label><input className="field" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} required/></div>
      <div><label className="label">Catégorie</label><select className="field" value={form.categorie_id} onChange={e => setForm({...form, categorie_id: e.target.value})}><option value="">Sans catégorie</option>{categories.map(item => <option key={item.id} value={item.id}>{item.nom}</option>)}</select></div>
      <div><label className="label">Prix de vente *</label><input className="field" type="number" min="0" step="1" value={form.prix_vente} onChange={e => setForm({...form, prix_vente: Number(e.target.value)})} required/></div>
      <div><label className="label">Coût estimé</label><input className="field" type="number" min="0" step="1" value={form.cout_estime} onChange={e => setForm({...form, cout_estime: Number(e.target.value)})}/></div>
      <div className="sm:col-span-2"><label className="label">Description</label><textarea className="field" rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})}/></div>
      <div className="sm:col-span-2"><label className="label">URL de l’image</label><input className="field" type="url" value={form.image_url} onChange={e => setForm({...form, image_url: e.target.value})}/></div>
      <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={form.disponible} onChange={e => setForm({...form, disponible: e.target.checked})} className="h-5 w-5 accent-brand-600"/>Disponible à la vente</label>
      {error && <p className="sm:col-span-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3 sm:col-span-2"><button type="button" className="btn-secondary" onClick={() => setModal(false)}>Annuler</button><button className="btn-primary" disabled={saving}>{saving && <LoaderCircle className="animate-spin" size={18}/>}Enregistrer</button></div>
    </form></div></div>}
  </>
}
