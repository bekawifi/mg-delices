import { NavLink } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Boxes,
  ChefHat,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Contact,
  CreditCard,
  FileClock,
  History,
  LogOut,
  MenuSquare,
  PackageOpen,
  ReceiptText,
  RotateCcw,
  Settings,
  ShoppingBag,
  Store,
  Truck,
  Utensils,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import type { Role } from "../../types/database";
import { useRestaurantSettings } from "../../contexts/RestaurantSettingsContext";
import { APP_NAME } from "../../lib/version";
import { hasRoleAccess } from "../../lib/users";

export const navigationLinks = [
  {
    to: "/",
    label: "Tableau de bord",
    icon: BarChart3,
    iconClass: "text-sky-400",
    roles: ["admin", "gestionnaire", "caissier", "serveur"],
  },
  {
    to: "/caisse",
    label: "Caisse",
    icon: CreditCard,
    iconClass: "text-emerald-400",
    roles: ["admin", "gestionnaire", "caissier"],
  },
  {
    to: "/caisse/historique",
    label: "Historique des ventes",
    icon: History,
    iconClass: "text-blue-300",
    roles: ["admin", "gestionnaire", "caissier"],
  },
  {
    to: "/commandes",
    label: "Commandes",
    icon: ClipboardList,
    iconClass: "text-orange-400",
    roles: ["admin", "gestionnaire", "caissier", "serveur"],
  },
  {
    to: "/cuisine",
    label: "Cuisine",
    icon: ChefHat,
    iconClass: "text-orange-300",
    roles: ["admin", "gestionnaire", "cuisine"],
  },
  {
    to: "/tables",
    label: "Tables",
    icon: Store,
    iconClass: "text-violet-400",
    roles: ["admin", "gestionnaire", "serveur"],
  },
  {
    to: "/produits",
    label: "Menu / Produits",
    icon: MenuSquare,
    iconClass: "text-cyan-400",
    roles: ["admin", "gestionnaire", "caissier", "serveur"],
  },
  {
    to: "/stock",
    label: "Stock",
    icon: Boxes,
    iconClass: "text-teal-400",
    roles: ["admin", "gestionnaire"],
  },
  {
    to: "/stock/inventaires",
    label: "Inventaires",
    icon: ClipboardCheck,
    iconClass: "text-indigo-400",
    roles: ["admin", "gestionnaire"],
  },
  {
    to: "/stock/recettes",
    label: "Fiches techniques / Recettes",
    icon: Utensils,
    iconClass: "text-lime-400",
    roles: ["admin", "gestionnaire"],
  },
  {
    to: "/achats",
    label: "Achats",
    icon: ShoppingBag,
    iconClass: "text-orange-400",
    roles: ["admin", "gestionnaire"],
  },
  {
    to: "/fournisseurs",
    label: "Fournisseurs",
    icon: Truck,
    iconClass: "text-amber-400",
    roles: ["admin", "gestionnaire"],
  },
  {
    to: "/depenses",
    label: "Dépenses",
    icon: CircleDollarSign,
    iconClass: "text-red-400",
    roles: ["admin", "gestionnaire"],
  },
  {
    to: "/clients",
    label: "Clients",
    icon: Contact,
    iconClass: "text-blue-400",
    roles: ["admin", "gestionnaire", "caissier", "serveur"],
  },
  {
    to: "/retours",
    label: "Retours clients",
    icon: RotateCcw,
    iconClass: "text-fuchsia-400",
    roles: ["admin", "gestionnaire", "caissier", "serveur"],
  },
  {
    to: "/achats/retours",
    label: "Retours fournisseurs",
    icon: PackageOpen,
    iconClass: "text-orange-500",
    roles: ["admin", "gestionnaire"],
  },
  {
    to: "/rapports",
    label: "Rapports",
    icon: ReceiptText,
    iconClass: "text-indigo-400",
    roles: ["admin", "gestionnaire"],
  },
  {
    to: "/admin/utilisateurs",
    label: "Utilisateurs",
    icon: Users,
    iconClass: "text-emerald-300",
    roles: ["admin"],
  },
  {
    to: "/admin/audit",
    label: "Journal d’audit",
    icon: FileClock,
    iconClass: "text-purple-400",
    roles: ["admin"],
  },
  {
    to: "/admin/diagnostic",
    label: "Diagnostic",
    icon: Activity,
    iconClass: "text-cyan-400",
    roles: ["admin"],
  },
  {
    to: "/profil",
    label: "Mon profil",
    icon: UserRound,
    iconClass: "text-sky-300",
    roles: ["super_admin", "admin", "gestionnaire", "caissier", "serveur", "cuisine"],
  },
  {
    to: "/parametres",
    label: "Paramètres",
    icon: Settings,
    iconClass: "text-slate-300",
    roles: ["admin", "gestionnaire"],
  },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signOut, profile } = useAuth();
  const { settings } = useRestaurantSettings();
  return (
    <>
      {open && (
        <button
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={onClose}
          aria-label="Fermer le menu"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand-900 text-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
          <div className="min-w-0">
            <p className="text-xl font-black tracking-wide">{APP_NAME}</p>
            <p className="truncate text-xs text-brand-100">{settings.nom}</p>
          </div>
          <button onClick={onClose} className="p-2 lg:hidden">
            <X />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navigationLinks
            .filter((link) => profile && hasRoleAccess(profile.role, link.roles as Role[]))
            .map(({ to, label, icon: Icon, iconClass }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/" || to === "/caisse"}
                onClick={onClose}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${isActive ? "bg-white text-brand-900 shadow" : "text-brand-50 hover:bg-white/10"}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${isActive ? "bg-slate-100" : "bg-white/10 group-hover:bg-white/15"}`}
                    >
                      <Icon size={19} className={iconClass} aria-hidden="true" />
                    </span>
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
        </nav>
        <button
          onClick={() => signOut()}
          className="m-3 flex items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-sm font-semibold transition hover:border-red-300/30 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-red-500/10">
            <LogOut size={19} className="text-red-300" aria-hidden="true" />
          </span>
          Déconnexion
        </button>
      </aside>
    </>
  );
}
