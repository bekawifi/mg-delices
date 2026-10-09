import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, LoaderCircle, Minus, Plus, Printer, Search, Send, ShoppingCart, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { userMessageFromError } from '../../lib/errors'
import { formatDateTime, formatMoney } from '../../lib/format'
import { kitchenStatusLabel, orderStatusLabel } from '../../lib/orders'
import { useAuth } from '../../contexts/AuthContext'
import type { Category, PaymentMethod, Product } from '../../types/database'
import type { OrderDetail } from '../../types/orders'
import type { Customer } from '../../types/customers'
import { kitchenTicketHtml, printHtml } from '../../lib/printing'

export function OrderDialog({ orderId, onClose, onChanged }: { orderId: string; onClose: () => void; onChanged: () => void }) {
  const { profile } = useAuth()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [picker, setPicker] = useState(false)
  const [checkout, setCheckout] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [selection, setSelection] = useState<Record<string, { product: Product; quantity: number; notes: string }>>({})
  const [discount, setDiscount] = useState(0)
  const [received, setReceived] = useState(0)
  const [payment, setPayment] = useState<PaymentMethod>('especes')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<string | null>(null)
  const key = useRef(crypto.randomUUID())
  const canServe = profile?.role === 'admin' || profile?.role === 'gestionnaire' || profile?.role === 'serveur'
  const canCheckout = profile?.role === 'admin' || profile?.role === 'gestionnaire' || profile?.role === 'caissier'

  const load = async () => {
    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('get_order_detail', { p_commande_id: orderId })
    if (rpcError) setError(userMessageFromError(rpcError, 'Impossible de charger la commande.'))
    else setOrder(data as OrderDetail)
    setLoading(false)
  }
  useEffect(() => { void load();void supabase.rpc('get_customers_overview',{p_search:null,p_only_with_debt:false}).then(({data})=>setCustomers(((data||[])as Customer[]).filter(item=>item.actif))) }, [orderId])

  const act = async (rpc: string, args: Record<string, unknown>, success?: (data: unknown) => void) => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc(rpc, args)
      if (rpcError) setError(userMessageFromError(rpcError, 'L’action n’a pas pu être effectuée.'))
      else { success?.(data); await load(); onChanged() }
    } catch (caught) { setError(userMessageFromError(caught)) }
    finally { setBusy(false) }
  }

  const openPicker = async () => {
    if (!products.length) {
      const [p, c] = await Promise.all([
        supabase.from('produits').select('*, categories(nom)').eq('disponible', true).order('nom'),
        supabase.from('categories').select('*').eq('actif', true).order('ordre'),
      ])
      if (p.error || c.error) return setError(userMessageFromError(p.error || c.error, 'Impossible de charger le menu.'))
      setProducts((p.data || []) as Product[]); setCategories((c.data || []) as Category[])
    }
    setPicker(true)
  }
  const addQuantity = (product: Product, delta: number) => setSelection(current => {
    const quantity = (current[product.id]?.quantity || 0) + delta
    if (quantity <= 0) { const next = {...current}; delete next[product.id]; return next }
    return {...current, [product.id]: { product, quantity, notes: current[product.id]?.notes || '' }}
  })
  const filtered = useMemo(() => products.filter(product => product.nom.toLowerCase().includes(search.toLowerCase()) && (category === 'all' || product.categorie_id === category)), [products, search, category])
  const selectionCount = Object.values(selection).reduce((sum, item) => sum + item.quantity, 0)
  const submitItems = () => act('add_order_items', {
    p_commande_id: orderId,
    p_items: Object.values(selection).map(item => ({ produit_id: item.product.id, quantite: item.quantity, notes: item.notes || null })),
  }, () => { setPicker(false); setSelection({}) })
  const performCheckout = () => act('checkout_order', {
    p_commande_id: orderId, p_idempotency_key: key.current, p_remise: discount,
    p_montant_recu: received, p_mode_paiement: payment, p_client_id: customerId,
  }, data => { const sale = data as { numero?: string; reste_a_payer?: number }; setCheckout(false); setNotice(`Vente ${sale.numero || ''} validée · reste dû ${formatMoney(sale.reste_a_payer||0)}.`) })
  const openCheckout = async () => {
    const { data, error: cashError } = await supabase.rpc('get_cash_session_summary', { p_session_id: null })
    if (cashError || !data) return setError('Veuillez ouvrir une session de caisse avant d’effectuer une opération financière.')
    setReceived(order?.total || 0); setCheckout(true); setError('')
  }
  const printKitchen = () => {
    if (!order) return
    printHtml(kitchenTicketHtml({ numero: order.numero_commande, table: order.table_nom ? `${order.table_nom} · ${order.table_numero}` : undefined, serveur: order.serveur_nom, date: order.opened_at, lignes: order.lignes.filter(line => line.statut_cuisine !== 'annulee').map(line => ({ quantite: line.quantite, designation: line.nom_produit_snapshot, notes: line.notes || undefined })) }))
  }

  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/55" role="dialog" aria-modal="true">
    <button className="absolute inset-0" onClick={onClose} aria-label="Fermer" />
    <div className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-brand-600">Détail commande</p><h2 className="text-xl font-black">{order?.numero_commande || 'Chargement…'}</h2></div><button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100"><X/></button></header>
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? <div className="grid h-64 place-items-center"><LoaderCircle className="animate-spin text-brand-600"/></div> : order && <>
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-4">
            <div><p className="text-slate-500">Table</p><strong>{order.table_nom ? `${order.table_nom} · ${order.table_numero}` : order.type_commande}</strong></div>
            <div><p className="text-slate-500">Serveur</p><strong>{order.serveur_nom}</strong></div>
            <div><p className="text-slate-500">Ouverte</p><strong>{formatDateTime(order.opened_at)}</strong></div>
            <div><p className="text-slate-500">Statut</p><strong>{orderStatusLabel[order.statut]}</strong></div>
          </div>
          {order.notes && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{order.notes}</p>}
          <div className="mt-6 flex items-center justify-between"><h3 className="font-black">Articles</h3>{canServe && !['annulee','cloturee'].includes(order.statut) && <button className="btn-secondary min-h-9 px-3 py-1.5 text-sm" onClick={openPicker}><Plus size={16}/>Ajouter</button>}</div>
          <div className="mt-3 space-y-2">{order.lignes.map(line => <div key={line.id} className={`rounded-xl border p-3 ${line.statut_cuisine === 'annulee' ? 'opacity-50' : ''}`}><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 font-black text-brand-700">{line.quantite}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><strong>{line.nom_produit_snapshot}</strong><strong>{formatMoney(line.quantite * line.prix_unitaire_snapshot)}</strong></div><p className="text-xs text-slate-500">{kitchenStatusLabel[line.statut_cuisine]}{!line.sent_to_kitchen_at && ' · Non envoyé'}</p>{line.notes && <p className="mt-1 text-xs font-medium text-amber-700">Note : {line.notes}</p>}</div>{canServe && line.statut_cuisine === 'prete' && <button onClick={() => act('mark_item_served', { p_ligne_id: line.id })} className="rounded-lg bg-emerald-100 p-2 text-emerald-700" title="Marquer servi"><Check size={17}/></button>}{canServe && ['a_preparer'].includes(line.statut_cuisine) && <button onClick={() => act('cancel_order_item', { p_ligne_id: line.id, p_motif: null })} className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="Annuler"><Trash2 size={17}/></button>}</div></div>)}</div>
          <div className="mt-5 flex justify-between border-t pt-4 text-xl"><strong>Total courant</strong><strong className="text-brand-700">{formatMoney(order.total)}</strong></div>
          {order.events.length > 0 && <details className="mt-6"><summary className="cursor-pointer font-bold text-slate-700">Historique</summary><div className="mt-3 space-y-3 border-l-2 pl-4">{order.events.map((event, index) => <div key={`${event.created_at}-${index}`}><p className="text-sm font-semibold">{event.event_type.replace(/_/g, ' ')}</p><p className="text-xs text-slate-500">{formatDateTime(event.created_at)} · {event.actor_name}</p></div>)}</div></details>}
        </>}
        {notice && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</p>}
        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </div>
      {order && !picker && !checkout && <footer className="grid gap-2 border-t bg-white p-4 sm:grid-cols-3">
        <button className="btn-secondary" onClick={printKitchen}><Printer size={18}/>Imprimer bon cuisine</button>
        {canServe && order.lignes.some(line => !line.sent_to_kitchen_at && line.statut_cuisine !== 'annulee') && <button disabled={busy} className="btn-primary" onClick={() => act('send_order_to_kitchen', { p_commande_id: orderId })}><Send size={18}/>Envoyer cuisine</button>}
        {canServe && order.statut === 'prete' && <button disabled={busy} className="btn-primary" onClick={() => act('mark_order_served', { p_commande_id: orderId })}><Check size={18}/>Marquer servie</button>}
        {canCheckout && order.statut === 'servie' && <button className="btn-primary" onClick={() => void openCheckout()}><ShoppingCart size={18}/>Passer en caisse</button>}
        {canServe && !['annulee','cloturee'].includes(order.statut) && <button disabled={busy} className="btn-secondary border-red-200 text-red-600 hover:bg-red-50" onClick={() => { if (window.confirm('Annuler toute la commande ?')) void act('cancel_order', { p_commande_id: orderId, p_motif: null }) }}><Trash2 size={18}/>Annuler commande</button>}
      </footer>}

      {picker && <div className="absolute inset-0 flex flex-col bg-white"><header className="flex items-center justify-between border-b p-5"><h3 className="text-xl font-black">Ajouter des articles</h3><button onClick={() => setPicker(false)} className="p-2"><X/></button></header><div className="border-b p-4"><div className="relative"><Search className="absolute left-3 top-3.5 text-slate-400" size={18}/><input className="field pl-10" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"/></div><div className="mt-3 flex gap-2 overflow-x-auto"><button className={`rounded-lg px-3 py-2 text-sm font-bold ${category === 'all' ? 'bg-brand-600 text-white' : 'bg-slate-100'}`} onClick={() => setCategory('all')}>Tout</button>{categories.map(item => <button key={item.id} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold ${category === item.id ? 'bg-brand-600 text-white' : 'bg-slate-100'}`} onClick={() => setCategory(item.id)}>{item.nom}</button>)}</div></div><div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-4 sm:grid-cols-3">{filtered.map(product => { const item = selection[product.id]; return <div key={product.id} className="rounded-xl border p-3"><p className="min-h-10 font-bold">{product.nom}</p><p className="text-sm font-black text-brand-700">{formatMoney(product.prix_vente)}</p><div className="mt-3 flex items-center justify-between rounded-lg bg-slate-100"><button onClick={() => addQuantity(product, -1)} className="p-2"><Minus size={17}/></button><strong>{item?.quantity || 0}</strong><button onClick={() => addQuantity(product, 1)} className="p-2"><Plus size={17}/></button></div>{item && <input className="mt-2 w-full rounded-lg border px-2 py-1.5 text-xs" placeholder="Note cuisine" value={item.notes} onChange={e => setSelection({...selection, [product.id]: {...item, notes: e.target.value}})}/>}</div>})}</div><footer className="border-t p-4"><button className="btn-primary w-full" disabled={!selectionCount || busy} onClick={submitItems}>{busy ? <LoaderCircle className="animate-spin" size={18}/> : <Plus size={18}/>}Ajouter {selectionCount} article(s)</button></footer></div>}

      {checkout && order && <div className="absolute inset-0 flex flex-col bg-white"><header className="flex items-center justify-between border-b p-5"><div><p className="text-xs font-bold text-brand-600">ENCAISSEMENT</p><h3 className="text-xl font-black">{order.numero_commande}</h3></div><button onClick={() => setCheckout(false)} className="p-2"><X/></button></header><div className="flex-1 overflow-y-auto p-6"><div className="rounded-2xl bg-brand-900 p-6 text-white"><p className="text-sm text-brand-100">Total commande</p><p className="text-4xl font-black">{formatMoney(order.total - Math.min(discount, order.total))}</p></div><div className="mt-6 space-y-4"><div><label className="label">Remise</label><input className="field" type="number" min="0" max={order.total} value={discount} onChange={e => setDiscount(Number(e.target.value))}/></div><div><label className="label">Client {received<order.total-Math.min(discount,order.total)&&'(obligatoire pour le crédit)'}</label><select className="field" value={customerId||''} onChange={e=>setCustomerId(e.target.value||null)}><option value="">Vente anonyme</option>{customers.map(c=><option key={c.id} value={c.id}>{c.nom} · disponible {formatMoney(Number(c.plafond_credit)-Number(c.encours_credit))}</option>)}</select></div><div><label className="label">Mode du paiement initial</label><select className="field" value={payment} onChange={e => setPayment(e.target.value as PaymentMethod)}><option value="especes">Espèces</option><option value="orange_money">Orange Money</option><option value="moov_money">Moov Money</option><option value="autre">Autre</option></select></div><div><label className="label">Montant reçu</label><input className="field text-right text-xl font-bold" type="number" min="0" value={received || ''} onChange={e => setReceived(Number(e.target.value))}/></div><div className="flex justify-between rounded-xl bg-slate-50 p-4"><span>Reste à payer</span><strong className="text-red-600">{formatMoney(Math.max(0,(order.total-Math.min(discount,order.total))-received))}</strong></div></div>{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}</div><footer className="border-t p-4"><button className="btn-primary w-full py-3" disabled={busy || (received < order.total-Math.min(discount,order.total) && !customerId)} onClick={performCheckout}>{busy ? <LoaderCircle className="animate-spin"/> : <ShoppingCart/>}Valider la vente</button></footer></div>}
    </div>
  </div>
}
