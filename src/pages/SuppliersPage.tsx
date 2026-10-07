import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { History, LoaderCircle, Pencil, Plus, Search, ToggleLeft, ToggleRight, Truck, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { userMessageFromError } from '../lib/errors'
import { formatMoney } from '../lib/format'
import type { SupplierBalance } from '../types/purchases'

interface SupplierHistory { achats: Array<{ id: string; numero_achat: string; date_achat: string; total: number; montant_paye: number; reste_a_payer: number; statut: string }>; paiements: Array<{ id: string; numero_achat: string; montant: number; mode_paiement: string; created_at: string }> }
const blank = { code: '', nom: '', telephone: '', email: '', adresse: '', notes: '', actif: true }

export function SuppliersPage() {
  const [items, setItems] = useState<SupplierBalance[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<SupplierBalance | null | undefined>(undefined)
  const [form, setForm] = useState(blank)
  const [historyFor, setHistoryFor] = useState<SupplierBalance | null>(null)
  const [history, setHistory] = useState<SupplierHistory | null>(null)

  const load = async () => {
    setLoading(true); setError('')
    const { data, error: rpcError } = await supabase.rpc('get_suppliers_balances')
    if (rpcError) setError(userMessageFromError(rpcError, 'Impossible de charger les fournisseurs.'))
    else setItems((data || []) as SupplierBalance[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const filtered = useMemo(() => { const q = search.toLowerCase(); return items.filter(item => `${item.code} ${item.nom} ${item.telephone}`.toLowerCase().includes(q)) }, [items, search])
  const summary = useMemo(() => ({ debt: items.reduce((sum, item) => sum + Number(item.reste_du), 0), unpaid: items.reduce((sum, item) => sum + Number(item.achats_non_soldes), 0) }), [items])
  const openForm = (item?: SupplierBalance) => {
    setEditing(item || null); setForm(item ? { code: item.code, nom: item.nom, telephone: item.telephone, email: item.email || '', adresse: item.adresse || '', notes: item.notes || '', actif: item.actif } : blank); setError('')
  }
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    const { error: rpcError } = await supabase.rpc('save_supplier', { p_id: editing?.id || null, p_code: form.code, p_nom: form.nom, p_telephone: form.telephone, p_email: form.email || null, p_adresse: form.adresse || null, p_notes: form.notes || null, p_actif: form.actif })
    if (rpcError) setError(userMessageFromError(rpcError, 'Le fournisseur n’a pas pu être enregistré.'))
    else { setEditing(undefined); await load() }
    setBusy(false)
  }
  const toggle = async (item: SupplierBalance) => {
    const { error: rpcError } = await supabase.rpc('save_supplier', { p_id: item.id, p_code: item.code, p_nom: item.nom, p_telephone: item.telephone, p_email: item.email, p_adresse: item.adresse, p_notes: item.notes, p_actif: !item.actif })
    if (rpcError) setError(userMessageFromError(rpcError, 'Le statut n’a pas pu être modifié.')); else await load()
  }
  const openHistory = async (item: SupplierBalance) => {
    setHistoryFor(item); setHistory(null); setError('')
    const { data, error: rpcError } = await supabase.rpc('get_supplier_history', { p_fournisseur_id: item.id })
    if (rpcError) setError(userMessageFromError(rpcError, 'Impossible de charger l’historique.')); else setHistory(data as SupplierHistory)
  }

  return <>
    <PageHeader title="Fournisseurs" description="Soldes, achats et historique des règlements." action={<button className="btn-primary" onClick={() => openForm()}><Plus size={18}/>Nouveau fournisseur</button>}/>
    <div className="mb-5 grid gap-4 sm:grid-cols-3"><div className="card p-5"><p className="text-sm text-slate-500">Fournisseurs</p><p className="text-2xl font-black">{items.length}</p></div><div className="card p-5"><p className="text-sm text-slate-500">Dette totale</p><p className="text-2xl font-black text-red-600">{formatMoney(summary.debt)}</p></div><div className="card p-5"><p className="text-sm text-slate-500">Achats non soldés</p><p className="text-2xl font-black text-amber-600">{summary.unpaid}</p></div></div>
    <div className="card mb-5 p-4"><div className="relative"><Search className="absolute left-3 top-3.5 text-slate-400" size={18}/><input className="field pl-10" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, code ou téléphone…"/></div></div>
    {error && editing === undefined && !historyFor && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="card overflow-hidden">{loading ? <div className="grid h-60 place-items-center"><LoaderCircle className="animate-spin"/></div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-4">Fournisseur</th><th className="px-5 py-4">Téléphone</th><th className="px-5 py-4">Achats</th><th className="px-5 py-4">Payé</th><th className="px-5 py-4">Dette</th><th className="px-5 py-4">Statut</th><th className="px-5 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y">{filtered.map(item => <tr key={item.id}><td className="px-5 py-4"><p className="font-bold">{item.nom}</p><p className="text-xs text-slate-500">{item.code}</p></td><td className="px-5 py-4">{item.telephone}</td><td className="px-5 py-4">{formatMoney(item.total_achats)}</td><td className="px-5 py-4">{formatMoney(item.total_paye)}</td><td className="px-5 py-4 font-bold text-red-600">{formatMoney(item.reste_du)}</td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.actif ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{item.actif ? 'Actif' : 'Inactif'}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button className="rounded-lg p-2 hover:bg-slate-100" title="Historique" onClick={() => void openHistory(item)}><History size={18}/></button><button className="rounded-lg p-2 hover:bg-slate-100" title="Modifier" onClick={() => openForm(item)}><Pencil size={18}/></button><button className="rounded-lg p-2 hover:bg-slate-100" title={item.actif ? 'Désactiver' : 'Réactiver'} onClick={() => void toggle(item)}>{item.actif ? <ToggleRight className="text-emerald-600"/> : <ToggleLeft/>}</button></div></td></tr>)}</tbody></table>{!filtered.length && <div className="grid h-48 place-items-center text-slate-500"><div className="text-center"><Truck className="mx-auto mb-2"/>Aucun fournisseur</div></div>}</div>}</div>
    {editing !== undefined && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4"><form onSubmit={save} className="card my-6 w-full max-w-xl p-6"><div className="mb-5 flex justify-between"><h2 className="text-xl font-black">{editing ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h2><button type="button" onClick={() => setEditing(undefined)}><X/></button></div><div className="grid gap-4 sm:grid-cols-2"><div><label className="label">Code</label><input required className="field" value={form.code} onChange={e => setForm({...form, code: e.target.value})}/></div><div><label className="label">Téléphone</label><input required className="field" value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})}/></div><div className="sm:col-span-2"><label className="label">Nom</label><input required className="field" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})}/></div><div><label className="label">Email</label><input type="email" className="field" value={form.email} onChange={e => setForm({...form, email: e.target.value})}/></div><div><label className="label">Adresse</label><input className="field" value={form.adresse} onChange={e => setForm({...form, adresse: e.target.value})}/></div><div className="sm:col-span-2"><label className="label">Notes</label><textarea className="field" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}/></div></div><label className="my-4 flex gap-2 text-sm font-bold"><input type="checkbox" checked={form.actif} onChange={e => setForm({...form, actif: e.target.checked})}/>Fournisseur actif</label>{error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={busy} className="btn-primary w-full">{busy && <LoaderCircle className="animate-spin" size={18}/>}Enregistrer</button></form></div>}
    {historyFor && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60"><button className="absolute inset-0" onClick={() => setHistoryFor(null)}/><div className="relative h-full w-full max-w-2xl overflow-y-auto bg-white p-6"><div className="mb-5 flex justify-between"><div><p className="text-xs font-bold text-brand-600">HISTORIQUE FOURNISSEUR</p><h2 className="text-xl font-black">{historyFor.nom}</h2></div><button onClick={() => setHistoryFor(null)}><X/></button></div>{!history ? <LoaderCircle className="mx-auto mt-20 animate-spin"/> : <><h3 className="mb-2 font-black">Achats</h3><div className="space-y-2">{history.achats.map(a => <div key={a.id} className="rounded-xl border p-3"><div className="flex justify-between"><strong>{a.numero_achat}</strong><span>{a.date_achat}</span></div><p className="mt-1 text-sm">Total {formatMoney(a.total)} · Payé {formatMoney(a.montant_paye)} · <span className="font-bold text-red-600">Reste {formatMoney(a.reste_a_payer)}</span></p></div>)}</div><h3 className="mb-2 mt-6 font-black">Règlements</h3><div className="space-y-2">{history.paiements.map(p => <div key={p.id} className="flex justify-between rounded-xl border p-3"><div><strong>{p.numero_achat}</strong><p className="text-xs text-slate-500">{p.mode_paiement}</p></div><strong className="text-emerald-700">{formatMoney(p.montant)}</strong></div>)}</div></>}</div></div>}
  </>
}
