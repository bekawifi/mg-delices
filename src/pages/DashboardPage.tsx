import { useEffect, useState } from 'react'
import { Banknote, CreditCard, HandCoins, LoaderCircle, Receipt, RotateCcw, Scale, ShoppingBasket, TrendingDown, TrendingUp, Users, WalletCards } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { formatDateTime, formatMoney } from '../lib/format'
import type { DashboardStats } from '../types/database'
import { userMessageFromError } from '../lib/errors'
import { useAuth } from '../contexts/AuthContext'
import type { SupplierDashboardStats } from '../types/purchases'
import type { CashDashboard } from '../types/cash'

const empty: DashboardStats = { chiffre_affaires: 0, encaissements: 0, nombre_ventes: 0, panier_moyen: 0, dernieres_ventes: [], produits_populaires: [] }
const emptySupplier: SupplierDashboardStats = { dette_fournisseurs: 0, achats_du_jour: 0, paiements_du_jour: 0, achats_non_soldes: 0 }
const emptyCash: CashDashboard = { caisse_ouverte: false, solde_theorique: 0, ecart_derniere_cloture: 0, depenses_du_jour: 0, resultat_operationnel_simplifie: 0 }

export function DashboardPage() {
  const { profile } = useAuth()
  const [stats, setStats] = useState(empty)
  const [supplierStats, setSupplierStats] = useState(emptySupplier)
  const [cashStats, setCashStats] = useState(emptyCash)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    void (async () => {
      try {
        const [{ data, error: rpcError }, supplierResult, cashResult] = await Promise.all([
          supabase.rpc('dashboard_stats'),
          profile?.role === 'admin' || profile?.role === 'gestionnaire' ? supabase.rpc('dashboard_supplier_stats') : Promise.resolve({ data: null, error: null }),
          ['admin','gestionnaire','caissier'].includes(profile?.role || '') ? supabase.rpc('dashboard_cash_stats') : Promise.resolve({ data: null, error: null }),
        ])
        if (rpcError) setError(userMessageFromError(rpcError, 'Impossible de charger le tableau de bord.'))
        else if (data) setStats(data as DashboardStats)
        if (supplierResult.error) setError(userMessageFromError(supplierResult.error, 'Impossible de charger les indicateurs fournisseurs.'))
        else if (supplierResult.data) setSupplierStats(supplierResult.data as SupplierDashboardStats)
        if (cashResult.error) setError(userMessageFromError(cashResult.error, 'Impossible de charger les indicateurs caisse.'))
        else if (cashResult.data) setCashStats(cashResult.data as CashDashboard)
      } catch (caught) { setError(userMessageFromError(caught)) }
      finally { setLoading(false) }
    })()
  }, [profile?.role])
  const cards = [
    { label: 'Chiffre d’affaires', value: formatMoney(stats.chiffre_affaires), icon: TrendingUp, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Encaissements', value: formatMoney(stats.encaissements), icon: CreditCard, color: 'bg-blue-50 text-blue-600' },
    { label: 'Nombre de ventes', value: stats.nombre_ventes.toString(), icon: Receipt, color: 'bg-violet-50 text-violet-600' },
    { label: 'Panier moyen', value: formatMoney(stats.panier_moyen), icon: ShoppingBasket, color: 'bg-amber-50 text-amber-600' },
  ]
  const supplierCards = [
    { label: 'Dette fournisseurs', value: formatMoney(supplierStats.dette_fournisseurs), icon: TrendingDown, color: 'bg-red-50 text-red-600' },
    { label: 'Achats du jour', value: formatMoney(supplierStats.achats_du_jour), icon: Receipt, color: 'bg-orange-50 text-orange-600' },
    { label: 'Paiements fournisseurs', value: formatMoney(supplierStats.paiements_du_jour), icon: HandCoins, color: 'bg-cyan-50 text-cyan-600' },
  ]
  const customerCards = [
    { label: 'Créances clients', value: formatMoney(stats.creances_clients || 0), icon: TrendingDown, color: 'bg-red-50 text-red-600' },
    { label: 'Clients débiteurs', value: String(stats.clients_debiteurs || 0), icon: Users, color: 'bg-violet-50 text-violet-600' },
  ]
  const correctionCards = [
    { label: 'CA brut du jour', value: formatMoney(stats.ventes_brutes ?? stats.chiffre_affaires), icon: TrendingUp, color: 'bg-blue-50 text-blue-600' },
    { label: 'Retours clients', value: formatMoney(stats.retours_clients || 0), icon: RotateCcw, color: 'bg-orange-50 text-orange-600' },
    { label: 'CA net du jour', value: formatMoney(stats.ca_net ?? stats.chiffre_affaires), icon: TrendingDown, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Remboursements', value: formatMoney(stats.remboursements || 0), icon: WalletCards, color: 'bg-red-50 text-red-600' },
    { label: 'Avoirs clients ouverts', value: formatMoney(stats.avoirs_clients_ouverts || 0), icon: Receipt, color: 'bg-violet-50 text-violet-600' },
    { label: 'Avoirs fournisseurs ouverts', value: formatMoney(stats.avoirs_fournisseurs_ouverts || 0), icon: HandCoins, color: 'bg-amber-50 text-amber-600' },
  ]
  return <>
    <PageHeader title="Tableau de bord" description={`Vue d’ensemble du ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date())}.`}/>
    {error && <div className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {loading ? <div className="grid h-64 place-items-center"><LoaderCircle className="animate-spin text-brand-600" size={32}/></div> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon, color }) => <div key={label} className="card p-5"><div className={`mb-4 grid h-11 w-11 place-items-center rounded-xl ${color}`}><Icon size={22}/></div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-black tracking-tight">{value}</p></div>)}</div>
      {(profile?.role === 'admin' || profile?.role === 'gestionnaire') && <><h2 className="mb-3 mt-6 font-black">Corrections et avoirs</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{correctionCards.map(({label,value,icon:Icon,color})=><div key={label} className="card p-5"><div className={`mb-4 grid h-11 w-11 place-items-center rounded-xl ${color}`}><Icon size={22}/></div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}</div></>}
      {(profile?.role === 'admin' || profile?.role === 'gestionnaire') && <><h2 className="mb-3 mt-6 font-black">Approvisionnements</h2><div className="grid gap-4 sm:grid-cols-3">{supplierCards.map(({ label, value, icon: Icon, color }) => <div key={label} className="card p-5"><div className={`mb-4 grid h-11 w-11 place-items-center rounded-xl ${color}`}><Icon size={22}/></div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-black tracking-tight">{value}</p></div>)}</div></>}
      {(profile?.role === 'admin' || profile?.role === 'gestionnaire') && <><h2 className="mb-3 mt-6 font-black">Crédit clients</h2><div className="grid gap-4 sm:grid-cols-2">{customerCards.map(({label,value,icon:Icon,color})=><div key={label} className="card p-5"><div className={`mb-4 grid h-11 w-11 place-items-center rounded-xl ${color}`}><Icon size={22}/></div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}</div></>}
      {['admin','gestionnaire','caissier'].includes(profile?.role || '') && <><h2 className="mb-3 mt-6 font-black">Caisse espèces</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div className="card p-5"><Banknote className="mb-3 text-emerald-600"/><p className="text-sm text-slate-500">État</p><b className="text-xl">{cashStats.caisse_ouverte?'Ouverte':'Fermée'}</b></div><div className="card p-5"><p className="text-sm text-slate-500">Solde théorique</p><b className="text-xl">{formatMoney(cashStats.solde_theorique)}</b></div><div className="card p-5"><Scale className="mb-3 text-amber-600"/><p className="text-sm text-slate-500">Écart dernière clôture</p><b className="text-xl">{formatMoney(cashStats.ecart_derniere_cloture)}</b></div><div className="card p-5"><p className="text-sm text-slate-500">Résultat opérationnel simplifié</p><b className="text-xl">{formatMoney(cashStats.resultat_operationnel_simplifie)}</b></div></div></>}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <section className="card overflow-hidden"><div className="border-b p-5"><h2 className="font-black">Dernières ventes</h2></div>{stats.dernieres_ventes.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Aucune vente aujourd’hui.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Numéro</th><th className="px-5 py-3">Heure</th><th className="px-5 py-3 text-right">Total</th></tr></thead><tbody className="divide-y">{stats.dernieres_ventes.map(sale => <tr key={sale.id}><td className="px-5 py-4 font-bold text-brand-700">{sale.numero}</td><td className="px-5 py-4 text-slate-500">{formatDateTime(sale.created_at)}</td><td className="px-5 py-4 text-right font-bold">{formatMoney(sale.total_final)}</td></tr>)}</tbody></table></div>}</section>
        <section className="card overflow-hidden"><div className="border-b p-5"><h2 className="font-black">Produits les plus vendus</h2></div>{stats.produits_populaires.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Pas encore de données.</p> : <div className="divide-y">{stats.produits_populaires.map((item, index) => <div key={item.nom} className="flex items-center gap-4 p-4"><span className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-sm font-black text-brand-700">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate font-bold">{item.nom}</p><p className="text-xs text-slate-500">{item.quantite} vendu(s)</p></div><strong className="text-sm">{formatMoney(item.montant)}</strong></div>)}</div>}</section>
      </div>
    </>}
  </>
}
