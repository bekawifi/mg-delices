import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, CheckCircle2, ImageIcon, LoaderCircle, Minus, Plus, Printer, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { calculateCart } from '../lib/cart'
import { buildSalePayload, calculateChange, validateCheckout } from '../lib/checkout'
import { userMessageFromError } from '../lib/errors'
import { formatMoney } from '../lib/format'
import { printHtml, saleReceiptHtml, type SaleReceipt } from '../lib/printing'
import type { CartItem, Category, OrderType, PaymentMethod, Product } from '../types/database'
import type { CashSummary } from '../types/cash'
import type { Customer } from '../types/customers'

interface SaleResult { sale_id: string; numero: string; total_final: number; montant_paye: number; reste_a_payer: number; montant_recu: number; monnaie_rendue: number; idempotent_replay: boolean }

export function PosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [orderType, setOrderType] = useState<OrderType>('sur_place')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('especes')
  const [discount, setDiscount] = useState(0)
  const [received, setReceived] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<SaleResult | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [cashSummary, setCashSummary] = useState<CashSummary | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<string | null>(null)
  const checkoutLock = useRef(false)
  const totals = calculateCart(cart, discount)

  useEffect(() => {
    Promise.all([
      supabase.from('produits').select('*, categories(nom)').eq('disponible', true).order('nom'),
      supabase.from('categories').select('*').eq('actif', true).order('ordre').order('nom'),
      supabase.rpc('get_cash_session_summary', { p_session_id: null }),
      supabase.rpc('get_customers_overview', { p_search: null, p_only_with_debt: false }),
    ]).then(([p, c, cash, clients]) => { if (p.error) setError(userMessageFromError(p.error, 'Impossible de charger les produits.')); else setProducts((p.data || []) as Product[]); if (c.error) setError(userMessageFromError(c.error, 'Impossible de charger les catégories.')); else setCategories((c.data || []) as Category[]); if (!cash.error) setCashSummary(cash.data as CashSummary|null); if (!clients.error) setCustomers(((clients.data||[])as Customer[]).filter(item=>item.actif)); setLoading(false) }).catch(caught => { setError(userMessageFromError(caught)); setLoading(false) })
  }, [])

  const filtered = useMemo(() => products.filter(item => item.nom.toLowerCase().includes(search.toLowerCase()) && (category === 'all' || item.categorie_id === category)), [products, search, category])
  const add = (product: Product) => setCart(current => {
    const found = current.find(item => item.product.id === product.id)
    return found ? current.map(item => item.product.id === product.id ? {...item, quantity: item.quantity + 1} : item) : [...current, { product, quantity: 1 }]
  })
  const setQuantity = (id: string, quantity: number) => setCart(current => quantity <= 0 ? current.filter(item => item.product.id !== id) : current.map(item => item.product.id === id ? {...item, quantity} : item))
  const newSale = () => { setCart([]); setDiscount(0); setReceived(0); setCustomerId(null); setSuccess(null); setError(''); setIdempotencyKey(crypto.randomUUID()) }
  const printReceipt = async () => { if(!success)return;const{data,error:receiptError}=await supabase.rpc('get_sale_receipt',{p_sale_id:success.sale_id});if(receiptError)setError(userMessageFromError(receiptError,'Impossible de préparer le ticket.'));else printHtml(saleReceiptHtml(data as SaleReceipt)) }

  const checkout = async () => {
    if (checkoutLock.current) return
    const validationError = validateCheckout(cart, totals.total, received, customerId)
    if (validationError) return setError(validationError)
    checkoutLock.current = true
    setSubmitting(true); setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('create_sale', buildSalePayload(idempotencyKey, orderType, totals.discount, received, paymentMethod, cart, customerId))
      if (rpcError) setError(userMessageFromError(rpcError, 'La vente n’a pas pu être enregistrée. Réessayez.'))
      else { setSuccess(data as SaleResult); setCart([]) }
    } catch (caught) { setError(userMessageFromError(caught)) }
    finally { checkoutLock.current = false; setSubmitting(false) }
  }

  if (success) return <><PageHeader title="Caisse"/><div className="card mx-auto max-w-xl p-8 text-center"><CheckCircle2 className="mx-auto text-emerald-500" size={72}/><p className="mt-5 text-sm font-semibold uppercase tracking-widest text-slate-500">{success.idempotent_replay ? 'Vente déjà enregistrée — reçu récupéré' : 'Vente enregistrée'}</p><h2 className="mt-1 text-3xl font-black">{success.numero}</h2><div className="my-7 rounded-2xl bg-slate-50 p-5"><p className="text-sm text-slate-500">Total de la vente</p><p className="text-3xl font-black text-brand-700">{formatMoney(success.total_final)}</p><p className="mt-2 text-sm">Payé : <strong>{formatMoney(success.montant_paye)}</strong> · Reste dû : <strong className="text-red-600">{formatMoney(success.reste_a_payer)}</strong></p><p className="mt-1 text-sm">Monnaie rendue : <strong>{formatMoney(success.monnaie_rendue)}</strong></p></div>{error&&<p className="mb-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}<div className="grid gap-3 sm:grid-cols-2"><button className="btn-primary" onClick={newSale}><Plus size={18}/>Nouvelle vente</button><button className="btn-secondary" onClick={() => void printReceipt()}><Printer size={18}/>Imprimer ticket</button></div></div></>

  return <>
    <PageHeader title="Caisse" description="Sélectionnez les produits puis procédez à l’encaissement." action={<Link className="btn-secondary" to="/caisse/journal"><BookOpen size={18}/>Session / Journal</Link>}/>
    <div className={`mb-4 rounded-xl border p-3 text-sm font-bold ${cashSummary?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-amber-200 bg-amber-50 text-amber-800'}`}>{cashSummary?`Caisse ouverte · Fond ${formatMoney(cashSummary.fond_ouverture)} · Solde théorique ${formatMoney(cashSummary.solde_theorique)}`:'Aucune caisse espèces ouverte. Ouvrez-la avant un encaissement en espèces.'}</div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
      <section className="min-w-0">
        <div className="card mb-4 p-4"><div className="relative"><Search className="absolute left-3 top-3.5 text-slate-400" size={19}/><input className="field pl-10" placeholder="Rechercher un produit…" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="mt-3 flex gap-2 overflow-x-auto pb-1"><button onClick={() => setCategory('all')} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold ${category === 'all' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Tout</button>{categories.map(item => <button key={item.id} onClick={() => setCategory(item.id)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold ${category === item.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{item.nom}</button>)}</div></div>
        {loading ? <div className="grid h-60 place-items-center"><LoaderCircle className="animate-spin text-brand-600"/></div> : <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">{filtered.map(product => <button key={product.id} onClick={() => add(product)} className="card overflow-hidden text-left transition hover:-translate-y-0.5 hover:border-brand-300 active:scale-[.98]"><div className="aspect-[4/3] bg-slate-100">{product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover"/> : <div className="grid h-full place-items-center text-slate-300"><ImageIcon size={36}/></div>}</div><div className="p-3"><p className="line-clamp-2 min-h-10 font-bold">{product.nom}</p><p className="mt-1 font-black text-brand-700">{formatMoney(product.prix_vente)}</p></div></button>)}</div>}
      </section>
      <aside className="card flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden xl:sticky xl:top-20">
        <div className="flex items-center gap-3 border-b p-5"><div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><ShoppingCart size={21}/></div><div><h2 className="font-black">Panier</h2><p className="text-xs text-slate-500">{cart.reduce((n, item) => n + item.quantity, 0)} article(s)</p></div></div>
        <div className="min-h-32 flex-1 space-y-3 overflow-y-auto p-4">{cart.length === 0 ? <div className="grid h-full min-h-36 place-items-center text-center text-sm text-slate-400">Touchez un produit<br/>pour l’ajouter</div> : cart.map(item => <div key={item.product.id} className="rounded-xl border p-3"><div className="flex justify-between gap-3"><div><p className="font-bold">{item.product.nom}</p><p className="text-xs text-slate-500">{formatMoney(item.product.prix_vente)} / unité</p></div><button onClick={() => setQuantity(item.product.id, 0)} className="text-red-500"><Trash2 size={18}/></button></div><div className="mt-3 flex items-center justify-between"><div className="flex items-center rounded-lg bg-slate-100"><button className="p-2" onClick={() => setQuantity(item.product.id, item.quantity - 1)}><Minus size={16}/></button><span className="w-8 text-center font-bold">{item.quantity}</span><button className="p-2" onClick={() => setQuantity(item.product.id, item.quantity + 1)}><Plus size={16}/></button></div><strong>{formatMoney(item.quantity * item.product.prix_vente)}</strong></div></div>)}</div>
        <div className="border-t bg-slate-50 p-4">
          <div className="mb-3 grid grid-cols-3 gap-2">{(['sur_place','emporter','livraison'] as OrderType[]).map(type => <button key={type} onClick={() => setOrderType(type)} className={`rounded-lg px-2 py-2 text-xs font-bold ${orderType === type ? 'bg-brand-600 text-white' : 'bg-white text-slate-600'}`}>{type === 'sur_place' ? 'Sur place' : type === 'emporter' ? 'À emporter' : 'Livraison'}</button>)}</div>
          <div className="space-y-2 text-sm"><div className="flex justify-between"><span>Sous-total</span><strong>{formatMoney(totals.subtotal)}</strong></div><div className="flex items-center justify-between gap-4"><label htmlFor="discount">Remise</label><input id="discount" className="w-32 rounded-lg border px-2 py-1.5 text-right" type="number" min="0" max={totals.subtotal} value={discount} onChange={e => setDiscount(Number(e.target.value))}/></div><div className="flex justify-between border-t pt-3 text-lg"><strong>Total</strong><strong className="text-brand-700">{formatMoney(totals.total)}</strong></div></div>
          <div className="mt-3"><label className="label">Client {received<totals.total&&'(obligatoire pour le crédit)'}</label><select className="field py-2" value={customerId||''} onChange={e=>setCustomerId(e.target.value||null)}><option value="">Vente anonyme</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.nom} · disponible {formatMoney(Number(customer.plafond_credit)-Number(customer.encours_credit))}</option>)}</select></div>
          <div className="mt-3 grid grid-cols-2 gap-3"><div><label className="label">Paiement initial</label><select className="field py-2" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}><option value="especes">Espèces</option><option value="orange_money">Orange Money</option><option value="moov_money">Moov Money</option><option value="autre">Autre</option></select></div><div><label className="label">Montant reçu</label><input className="field py-2 text-right" type="number" min="0" value={received || ''} onChange={e => setReceived(Number(e.target.value))}/></div></div>
          <div className="mt-2 flex justify-between text-sm"><span>Reste à payer</span><strong className="text-red-600">{formatMoney(Math.max(0,totals.total-received))}</strong></div>
          <div className="mt-2 flex justify-between text-sm"><span>Monnaie à rendre</span><strong>{formatMoney(calculateChange(totals.total, received))}</strong></div>
          {error && <p className="mt-3 rounded-lg bg-red-100 p-2 text-xs text-red-700">{error}</p>}
          <button className="btn-primary mt-4 w-full py-3 text-base" disabled={!cart.length || submitting} onClick={checkout}>{submitting && <LoaderCircle className="animate-spin" size={18}/>}Encaisser {formatMoney(totals.total)}</button>
        </div>
      </aside>
    </div>
  </>
}
