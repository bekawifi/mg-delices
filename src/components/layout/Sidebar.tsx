import { NavLink } from 'react-router-dom'
import { Activity, BarChart3, Boxes, ChefHat, CircleDollarSign, ClipboardList, Contact, CreditCard, FileClock, LogOut, MenuSquare, PackageOpen, ReceiptText, RotateCcw, Settings, ShoppingBag, Store, Truck, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import type { Role } from '../../types/database'

export const navigationLinks = [
  { to: '/', label: 'Tableau de bord', icon: BarChart3, roles: ['admin','gestionnaire','caissier','serveur'] },
  { to: '/caisse', label: 'Caisse', icon: CreditCard, roles: ['admin','gestionnaire','caissier'] },
  { to: '/commandes', label: 'Commandes', icon: ClipboardList, roles: ['admin','gestionnaire','caissier','serveur'] },
  { to: '/cuisine', label: 'Cuisine', icon: ChefHat, roles: ['admin','gestionnaire','cuisine'] },
  { to: '/tables', label: 'Tables', icon: Store, roles: ['admin','gestionnaire','serveur'] },
  { to: '/produits', label: 'Menu / Produits', icon: MenuSquare, roles: ['admin','gestionnaire','caissier','serveur'] },
  { to: '/stock', label: 'Stock', icon: Boxes, roles: ['admin','gestionnaire'] },
  { to: '/achats', label: 'Achats', icon: ShoppingBag, roles: ['admin','gestionnaire'] },
  { to: '/fournisseurs', label: 'Fournisseurs', icon: Truck, roles: ['admin','gestionnaire'] },
  { to: '/depenses', label: 'Dépenses', icon: CircleDollarSign, roles: ['admin','gestionnaire'] },
  { to: '/clients', label: 'Clients', icon: Contact, roles: ['admin','gestionnaire','caissier','serveur'] },
  { to: '/retours', label: 'Retours clients', icon: RotateCcw, roles: ['admin','gestionnaire','caissier','serveur'] },
  { to: '/achats/retours', label: 'Retours fournisseurs', icon: PackageOpen, roles: ['admin','gestionnaire'] },
  { to: '/rapports', label: 'Rapports', icon: ReceiptText, roles: ['admin','gestionnaire'] },
  { to: '/admin/audit', label: 'Journal d’audit', icon: FileClock, roles: ['admin'] },
  { to: '/admin/diagnostic', label: 'Diagnostic', icon: Activity, roles: ['admin'] },
  { to: '/parametres', label: 'Paramètres', icon: Settings, roles: ['admin','gestionnaire'] },
]

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signOut, profile } = useAuth()
  return <>
    {open && <button className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={onClose} aria-label="Fermer le menu" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand-900 text-white transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
        <div><p className="text-xl font-black tracking-wide">MG DELICES</p><p className="text-xs text-brand-100">Gestion restaurant</p></div>
        <button onClick={onClose} className="p-2 lg:hidden"><X /></button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navigationLinks.filter(link => profile && (link.roles as Role[]).includes(profile.role)).map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={onClose} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-white text-brand-900 shadow' : 'text-brand-50 hover:bg-white/10'}`}><Icon size={19} />{label}</NavLink>)}
      </nav>
      <button onClick={() => signOut()} className="m-3 flex items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-sm font-semibold hover:bg-white/10"><LogOut size={19} />Déconnexion</button>
    </aside>
  </>
}
