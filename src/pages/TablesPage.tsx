import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Clock3, Edit3, LoaderCircle, MapPin, Plus, Settings2, Users, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { OrderDialog } from '../components/orders/OrderDialog'
import { useAuth } from '../contexts/AuthContext'
import { userMessageFromError } from '../lib/errors'
import { formatMoney } from '../lib/format'
import { tableStateLabel, tableStateStyle } from '../lib/orders'
import { supabase } from '../lib/supabase'
import type { RestaurantTable, TableOverview, Zone } from '../types/orders'

export function TablesPage() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'gestionnaire'
  const canOpen = canManage || profile?.role === 'serveur'
  const [tables, setTables] = useState<TableOverview[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [orderId, setOrderId] = useState<string | null>(null)
  const [manage, setManage] = useState(false)
  const [zoneForm, setZoneForm] = useState({ id: '', nom: '', ordre: 0, actif: true })
  const [tableForm, setTableForm] = useState({ id: '', zone_id: '', nom: '', numero: 1, capacite: 2, actif: true })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    const [overview, zoneResult] = await Promise.all([
      supabase.rpc('get_tables_overview'), supabase.from('zones').select('*').order('ordre').order('nom'),
    ])
    if (overview.error) setError(userMessageFromError(overview.error, 'Impossible de charger les tables.'))
    else setTables((overview.data || []) as TableOverview[])
    if (!zoneResult.error) setZones((zoneResult.data || []) as Zone[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const grouped = useMemo(() => Object.entries(tables.reduce<Record<string, TableOverview[]>>((result, table) => { (result[table.zone_nom] ||= []).push(table); return result }, {})), [tables])

  const selectTable = async (table: TableOverview) => {
    if (table.commande_id) return setOrderId(table.commande_id)
    if (!canOpen || !table.actif) return
    setSaving(true); setError('')
    const { data, error: rpcError } = await supabase.rpc('open_table_order', { p_table_id: table.id, p_notes: null })
    if (rpcError) setError(userMessageFromError(rpcError, 'La table n’a pas pu être ouverte.'))
    else { setOrderId((data as { id: string }).id); await load() }
    setSaving(false)
  }
  const saveZone = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    const payload = { nom: zoneForm.nom.trim(), ordre: zoneForm.ordre, actif: zoneForm.actif }
    const result = zoneForm.id ? await supabase.from('zones').update(payload).eq('id', zoneForm.id) : await supabase.from('zones').insert(payload)
    if (result.error) setError(userMessageFromError(result.error, 'La zone n’a pas pu être enregistrée.'))
    else { setZoneForm({ id: '', nom: '', ordre: 0, actif: true }); await load() }
    setSaving(false)
  }
  const saveTable = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    const payload = { zone_id: tableForm.zone_id, nom: tableForm.nom.trim(), numero: tableForm.numero, capacite: tableForm.capacite, actif: tableForm.actif }
    const result = tableForm.id ? await supabase.from('tables_restaurant').update(payload).eq('id', tableForm.id) : await supabase.from('tables_restaurant').insert(payload)
    if (result.error) setError(userMessageFromError(result.error, 'La table n’a pas pu être enregistrée.'))
    else { setTableForm({ id: '', zone_id: zones[0]?.id || '', nom: '', numero: 1, capacite: 2, actif: true }); await load() }
    setSaving(false)
  }
  const editTable = (event: React.MouseEvent, table: TableOverview) => { event.stopPropagation(); setTableForm({ id: table.id, zone_id: table.zone_id, nom: table.nom, numero: table.numero, capacite: table.capacite, actif: table.actif }); setManage(true) }

  return <>
    <PageHeader title="Tables" description="Suivez le service en salle en temps réel." action={canManage && <button className="btn-secondary" onClick={() => { setTableForm(current => ({...current, zone_id: current.zone_id || zones[0]?.id || ''})); setManage(true) }}><Settings2 size={18}/>Gérer la salle</button>}/>
    {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <div className="grid h-64 place-items-center"><LoaderCircle className="animate-spin text-brand-600" size={32}/></div> : grouped.length === 0 ? <div className="card grid min-h-72 place-items-center text-center"><div><MapPin className="mx-auto text-slate-300" size={44}/><h2 className="mt-3 font-black">Aucune table configurée</h2><p className="text-sm text-slate-500">Créez une zone puis ajoutez vos tables.</p></div></div> : <div className="space-y-8">{grouped.map(([zone, items]) => <section key={zone}><div className="mb-3 flex items-center gap-2"><MapPin size={18} className="text-brand-600"/><h2 className="text-lg font-black">{zone}</h2><span className="text-sm text-slate-400">{items.length} table(s)</span></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{items.map(table => <button key={table.id} disabled={saving || !table.actif} onClick={() => selectTable(table)} className={`relative min-h-48 rounded-2xl border-2 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-card disabled:opacity-50 ${tableStateStyle[table.etat]}`}><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider">Table {table.numero}</p><h3 className="mt-1 text-xl font-black">{table.nom}</h3></div>{canManage && <span role="button" tabIndex={0} onClick={event => editTable(event, table)} className="rounded-lg bg-white/60 p-2"><Edit3 size={16}/></span>}</div><span className="mt-3 inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-black">{tableStateLabel[table.etat]}</span><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><span className="flex items-center gap-1"><Users size={14}/>{table.capacite} places</span>{table.opened_at && <span className="flex items-center gap-1"><Clock3 size={14}/>{new Intl.DateTimeFormat('fr-FR', {hour:'2-digit', minute:'2-digit'}).format(new Date(table.opened_at))}</span>}</div>{table.commande_id && <div className="mt-3 flex items-end justify-between border-t border-current/10 pt-3"><div><p className="text-xs">{table.serveur_nom}</p><p className="text-xs opacity-70">{table.numero_commande}</p></div><strong>{formatMoney(table.montant)}</strong></div>}</button>)}</div></section>)}</div>}
    {orderId && <OrderDialog orderId={orderId} onClose={() => setOrderId(null)} onChanged={() => void load()}/>} 
    {manage && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4"><div className="card my-6 w-full max-w-3xl p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">Configuration de la salle</h2><button onClick={() => setManage(false)} className="p-2"><X/></button></div><div className="grid gap-8 md:grid-cols-2"><form onSubmit={saveZone} className="space-y-3"><h3 className="font-black">{zoneForm.id ? 'Modifier la zone' : 'Nouvelle zone'}</h3><div><label className="label">Nom</label><input className="field" required value={zoneForm.nom} onChange={e => setZoneForm({...zoneForm, nom: e.target.value})}/></div><div><label className="label">Ordre</label><input className="field" type="number" min="0" value={zoneForm.ordre} onChange={e => setZoneForm({...zoneForm, ordre: Number(e.target.value)})}/></div><label className="flex gap-2 text-sm font-semibold"><input type="checkbox" checked={zoneForm.actif} onChange={e => setZoneForm({...zoneForm, actif: e.target.checked})}/>Zone active</label><button className="btn-primary w-full" disabled={saving}><Plus size={17}/>Enregistrer la zone</button><div className="space-y-1 pt-2">{zones.map(zone => <button type="button" key={zone.id} onClick={() => setZoneForm({id: zone.id, nom: zone.nom, ordre: zone.ordre, actif: zone.actif})} className="flex w-full justify-between rounded-lg bg-slate-50 p-2 text-sm"><span>{zone.nom}</span><Edit3 size={15}/></button>)}</div></form><form onSubmit={saveTable} className="space-y-3"><h3 className="font-black">{tableForm.id ? 'Modifier la table' : 'Nouvelle table'}</h3><div><label className="label">Zone</label><select className="field" required value={tableForm.zone_id} onChange={e => setTableForm({...tableForm, zone_id: e.target.value})}><option value="">Choisir…</option>{zones.map(zone => <option key={zone.id} value={zone.id}>{zone.nom}</option>)}</select></div><div><label className="label">Nom</label><input className="field" required value={tableForm.nom} onChange={e => setTableForm({...tableForm, nom: e.target.value})} placeholder="Table fenêtre"/></div><div className="grid grid-cols-2 gap-3"><div><label className="label">Numéro</label><input className="field" type="number" min="1" value={tableForm.numero} onChange={e => setTableForm({...tableForm, numero: Number(e.target.value)})}/></div><div><label className="label">Capacité</label><input className="field" type="number" min="1" value={tableForm.capacite} onChange={e => setTableForm({...tableForm, capacite: Number(e.target.value)})}/></div></div><label className="flex gap-2 text-sm font-semibold"><input type="checkbox" checked={tableForm.actif} onChange={e => setTableForm({...tableForm, actif: e.target.checked})}/>Table active</label><button className="btn-primary w-full" disabled={saving || !zones.length}><Plus size={17}/>Enregistrer la table</button></form></div>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}</div></div>}
  </>
}
