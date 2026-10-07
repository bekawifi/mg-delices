import { useEffect, useState } from 'react'
import { ChefHat, Clock3, LoaderCircle, Play, RotateCw, Check } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { userMessageFromError } from '../lib/errors'
import { canTransitionKitchen, elapsedMinutes } from '../lib/orders'
import { supabase } from '../lib/supabase'
import type { KitchenGroup } from '../types/orders'

export function KitchenPage() {
  const [groups, setGroups] = useState<KitchenGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const load = async (quiet = false) => {
    if (!quiet) setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('get_kitchen_board')
    if (rpcError) setError(userMessageFromError(rpcError, 'Impossible de charger la cuisine.'))
    else { setGroups((data || []) as KitchenGroup[]); setError('') }
    setLoading(false)
  }
  useEffect(() => {
    void load()
    const refresh = window.setInterval(() => { void load(true); setNow(Date.now()) }, 15000)
    return () => window.clearInterval(refresh)
  }, [])
  const act = async (lineId: string, action: 'start' | 'ready') => {
    setBusy(lineId); setError('')
    const { error: rpcError } = await supabase.rpc(action === 'start' ? 'start_kitchen_item' : 'mark_kitchen_item_ready', { p_ligne_id: lineId })
    if (rpcError) setError(userMessageFromError(rpcError, 'La mise à jour de l’article a échoué.'))
    await load(true); setBusy('')
  }
  return <>
    <PageHeader title="Cuisine" description="Les commandes sont actualisées automatiquement toutes les 15 secondes." action={<button className="btn-secondary" onClick={() => void load()}><RotateCw size={17}/>Actualiser</button>}/>
    {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <div className="grid h-64 place-items-center"><LoaderCircle className="animate-spin text-brand-600" size={32}/></div> : groups.length === 0 ? <div className="card grid min-h-[55vh] place-items-center text-center"><div><ChefHat className="mx-auto text-emerald-400" size={58}/><h2 className="mt-4 text-xl font-black">Tout est prêt !</h2><p className="text-slate-500">Aucun article en attente en cuisine.</p></div></div> : <div className="grid items-start gap-5 lg:grid-cols-2 2xl:grid-cols-3">{groups.map(group => { const minutes = elapsedMinutes(group.premier_envoi, now); return <section key={group.commande_id} className={`overflow-hidden rounded-2xl border-2 bg-white shadow-card ${minutes >= 20 ? 'border-red-300' : minutes >= 10 ? 'border-amber-300' : 'border-slate-200'}`}><header className="flex items-center justify-between border-b bg-slate-50 p-4"><div><p className="text-xs font-bold uppercase tracking-wider text-brand-600">{group.numero_commande}</p><h2 className="text-lg font-black">{group.table_nom ? `${group.table_nom} · ${group.table_numero}` : group.type_commande}</h2></div><span className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-black ${minutes >= 20 ? 'bg-red-100 text-red-700' : minutes >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-600'}`}><Clock3 size={15}/>{minutes} min</span></header><div className="divide-y">{group.lignes.map(line => <div key={line.id} className="p-4"><div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-900 text-lg font-black text-white">{line.quantite}</span><div className="min-w-0 flex-1"><h3 className="text-lg font-black">{line.nom}</h3>{line.notes && <p className="mt-1 rounded-lg bg-amber-50 p-2 text-sm font-semibold text-amber-800">{line.notes}</p>}<p className="mt-2 text-xs font-bold uppercase text-slate-400">{line.statut_cuisine === 'a_preparer' ? 'À préparer' : 'En préparation'}</p></div></div><button disabled={busy === line.id} onClick={() => void act(line.id, line.statut_cuisine === 'a_preparer' ? 'start' : 'ready')} className={`mt-3 w-full py-3 text-base ${line.statut_cuisine === 'a_preparer' ? 'btn-secondary' : 'btn-primary'}`}>{busy === line.id ? <LoaderCircle className="animate-spin"/> : canTransitionKitchen(line.statut_cuisine, 'start') ? <><Play size={19}/>Commencer</> : <><Check size={19}/>Prêt</>}</button></div>)}</div></section>})}</div>}
  </>
}
