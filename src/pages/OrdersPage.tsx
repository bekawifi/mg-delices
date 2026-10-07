import { useEffect, useState } from 'react'
import { Clock3, LoaderCircle, ReceiptText, Users } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { OrderDialog } from '../components/orders/OrderDialog'
import { userMessageFromError } from '../lib/errors'
import { formatMoney } from '../lib/format'
import { orderStatusLabel } from '../lib/orders'
import { supabase } from '../lib/supabase'
import type { OrderOverview } from '../types/orders'

const filters = [
  ['ouvertes', 'Ouvertes'], ['cuisine', 'Cuisine'], ['pretes', 'Prêtes'], ['servies', 'Servies'],
  ['cloturees', 'Clôturées'], ['annulees', 'Annulées'],
]

export function OrdersPage() {
  const [filter, setFilter] = useState('ouvertes')
  const [orders, setOrders] = useState<OrderOverview[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = async () => {
    setLoading(true); setError('')
    const { data, error: rpcError } = await supabase.rpc('get_orders_overview', { p_filter: filter })
    if (rpcError) setError(userMessageFromError(rpcError, 'Impossible de charger les commandes.'))
    else setOrders((data || []) as OrderOverview[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [filter])
  return <>
    <PageHeader title="Commandes" description="Suivi complet des commandes en salle."/>
    <div className="mb-5 flex gap-2 overflow-x-auto pb-1">{filters.map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold ${filter === value ? 'bg-brand-600 text-white' : 'border bg-white text-slate-600'}`}>{label}</button>)}</div>
    {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <div className="grid h-64 place-items-center"><LoaderCircle className="animate-spin text-brand-600"/></div> : orders.length === 0 ? <div className="card grid min-h-64 place-items-center text-center"><div><ReceiptText className="mx-auto text-slate-300" size={42}/><h2 className="mt-3 font-black">Aucune commande</h2><p className="text-sm text-slate-500">Aucune commande ne correspond à ce filtre.</p></div></div> : <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{orders.map(order => <button key={order.id} onClick={() => setSelected(order.id)} className="card p-5 text-left transition hover:-translate-y-0.5 hover:border-brand-300"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-brand-600">{order.numero_commande}</p><h3 className="mt-1 text-lg font-black">{order.table_nom ? `${order.table_nom} · Table ${order.table_numero}` : order.type_commande}</h3></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{orderStatusLabel[order.statut]}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-500"><span className="flex items-center gap-2"><Users size={16}/>{order.serveur_nom}</span><span className="flex items-center gap-2"><Clock3 size={16}/>{new Intl.DateTimeFormat('fr-FR', {hour:'2-digit', minute:'2-digit'}).format(new Date(order.opened_at))}</span></div><div className="mt-4 flex items-end justify-between border-t pt-4"><span className="text-sm text-slate-500">{order.nombre_articles} article(s)</span><strong className="text-lg text-brand-700">{formatMoney(order.total)}</strong></div></button>)}</div>}
    {selected && <OrderDialog orderId={selected} onClose={() => setSelected(null)} onChanged={() => void load()}/>} 
  </>
}
