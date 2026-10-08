import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, ClipboardCheck, LoaderCircle, Plus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { userMessageFromError } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { formatQuantity, isValidStockQuantity, quantityStep } from '../lib/inventory'
import type { InventoryDetail } from '../types/inventory'

interface InventoryRow { id: string; numero: string; statut: 'brouillon' | 'valide'; note: string | null; created_at: string; validated_at: string | null }

export function InventoriesPage() {
  const [items, setItems] = useState<InventoryRow[]>([])
  const [detail, setDetail] = useState<InventoryDetail | null>(null)
  const [counts, setCounts] = useState<Record<string, number | ''>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = async () => {
    setLoading(true)
    const { data, error: readError } = await supabase.from('inventaires').select('*').order('created_at', { ascending: false }).limit(50)
    if (readError) setError(userMessageFromError(readError, 'Impossible de charger les inventaires.'))
    else setItems((data || []) as InventoryRow[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const open = async (id: string) => {
    const { data, error: rpcError } = await supabase.rpc('get_inventory_detail', { p_inventaire_id: id })
    if (rpcError) return setError(userMessageFromError(rpcError, 'Impossible de charger l’inventaire.'))
    const loaded = data as InventoryDetail; setDetail(loaded); setCounts(Object.fromEntries(loaded.lignes.map(line => [line.matiere_id, line.quantite_comptee ?? '']))); setError('')
  }
  const create = async () => {
    setBusy(true); const { data, error: rpcError } = await supabase.rpc('create_inventory', { p_note: null })
    if (rpcError) setError(userMessageFromError(rpcError, 'Impossible de créer l’inventaire.'))
    else { await load(); await open(data as string) }
    setBusy(false)
  }
  const saveCounts = async () => {
    if (!detail) return false; setBusy(true); setError('')
    for (const line of detail.lignes) {
      const quantity = counts[line.matiere_id]
      if (quantity !== '' && !isValidStockQuantity(quantity, line.precision_decimale, true)) { setError(`La quantité de ${line.matiere_nom} ne respecte pas la précision de son unité.`); setBusy(false); return false }
      if (quantity === '') { setError('Renseignez toutes les quantités comptées.'); setBusy(false); return false }
      const { error: rpcError } = await supabase.rpc('set_inventory_count', { p_inventaire_id: detail.id, p_matiere_id: line.matiere_id, p_quantite_comptee: quantity })
      if (rpcError) { setError(userMessageFromError(rpcError, 'Une quantité n’a pas pu être enregistrée.')); setBusy(false); return false }
    }
    await open(detail.id); setBusy(false); return true
  }
  const validate = async () => {
    if (!detail || !window.confirm('Valider définitivement cet inventaire et appliquer les écarts ?')) return
    const saved = await saveCounts(); if (!saved) return; setBusy(true)
    const { error: rpcError } = await supabase.rpc('validate_inventory', { p_inventaire_id: detail.id })
    if (rpcError) setError(userMessageFromError(rpcError, 'L’inventaire n’a pas pu être validé.'))
    else { await load(); await open(detail.id) }
    setBusy(false)
  }
  return <>
    <PageHeader title="Inventaires physiques" description="Comptez les matières puis appliquez les écarts de façon atomique." action={<div className="flex gap-2"><Link to="/stock" className="btn-secondary"><ArrowLeft size={18}/>Retour</Link><button onClick={() => void create()} className="btn-primary" disabled={busy}><Plus size={18}/>Nouvel inventaire</button></div>}/>
    {error && !detail && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="card overflow-hidden">{loading ? <div className="grid h-60 place-items-center"><LoaderCircle className="animate-spin"/></div> : items.length ? <div className="divide-y">{items.map(item => <button key={item.id} onClick={() => void open(item.id)} className="flex w-full items-center justify-between p-5 text-left hover:bg-slate-50"><div><p className="font-black">{item.numero}</p><p className="text-sm text-slate-500">{formatDateTime(item.created_at)}{item.note ? ` · ${item.note}` : ''}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.statut === 'valide' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{item.statut === 'valide' ? 'Validé' : 'Brouillon'}</span></button>)}</div> : <div className="grid h-60 place-items-center text-center"><div><ClipboardCheck className="mx-auto text-slate-300" size={44}/><p className="mt-3 font-bold">Aucun inventaire</p></div></div>}</div>
    {detail && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/55"><button className="absolute inset-0" onClick={() => setDetail(null)}/><div className="relative flex h-full w-full max-w-2xl flex-col bg-white"><header className="flex items-center justify-between border-b p-5"><div><p className="text-xs font-bold text-brand-600">INVENTAIRE</p><h2 className="text-xl font-black">{detail.numero}</h2></div><button onClick={() => setDetail(null)} className="p-2"><X/></button></header><div className="flex-1 overflow-y-auto p-5"><div className="space-y-2">{detail.lignes.map(line => { const count = counts[line.matiere_id]; const difference = count === '' ? null : Number(count) - line.stock_theorique; return <div key={line.id} className="grid grid-cols-[1fr_130px] items-center gap-4 rounded-xl border p-3"><div><p className="font-bold">{line.matiere_nom}</p><p className="text-xs text-slate-500">Théorique : {formatQuantity(line.stock_theorique, line.precision_decimale, line.unite_code)}{difference !== null && ` · Écart : ${formatQuantity(difference, line.precision_decimale, line.unite_code)}`}</p></div><input disabled={detail.statut === 'valide'} className="field py-2 text-right" type="number" min="0" step={quantityStep(line.precision_decimale)} value={count} onChange={e => setCounts({...counts, [line.matiere_id]: e.target.value === '' ? '' : Number(e.target.value)})}/></div>})}</div>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}</div><footer className="grid gap-2 border-t p-4 sm:grid-cols-2">{detail.statut === 'brouillon' ? <><button className="btn-secondary" disabled={busy} onClick={() => void saveCounts()}>Enregistrer le comptage</button><button className="btn-primary" disabled={busy} onClick={() => void validate()}><CheckCircle2 size={18}/>Valider et appliquer</button></> : <div className="sm:col-span-2 flex items-center justify-center gap-2 py-3 font-bold text-emerald-700"><CheckCircle2/>Inventaire validé et immuable</div>}</footer></div></div>}
  </>
}
