import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { RoleRoute } from './components/RoleRoute'
import { useAuth } from './contexts/AuthContext'

const LoginPage=lazy(()=>import('./pages/LoginPage').then(m=>({default:m.LoginPage})))
const DashboardPage=lazy(()=>import('./pages/DashboardPage').then(m=>({default:m.DashboardPage})))
const ProductsPage=lazy(()=>import('./pages/ProductsPage').then(m=>({default:m.ProductsPage})))
const PosPage=lazy(()=>import('./pages/PosPage').then(m=>({default:m.PosPage})))
const TablesPage=lazy(()=>import('./pages/TablesPage').then(m=>({default:m.TablesPage})))
const OrdersPage=lazy(()=>import('./pages/OrdersPage').then(m=>({default:m.OrdersPage})))
const KitchenPage=lazy(()=>import('./pages/KitchenPage').then(m=>({default:m.KitchenPage})))
const StockPage=lazy(()=>import('./pages/StockPage').then(m=>({default:m.StockPage})))
const RecipesPage=lazy(()=>import('./pages/RecipesPage').then(m=>({default:m.RecipesPage})))
const InventoriesPage=lazy(()=>import('./pages/InventoriesPage').then(m=>({default:m.InventoriesPage})))
const SuppliersPage=lazy(()=>import('./pages/SuppliersPage').then(m=>({default:m.SuppliersPage})))
const PurchasesPage=lazy(()=>import('./pages/PurchasesPage').then(m=>({default:m.PurchasesPage})))
const ExpensesPage=lazy(()=>import('./pages/ExpensesPage').then(m=>({default:m.ExpensesPage})))
const CashJournalPage=lazy(()=>import('./pages/CashJournalPage').then(m=>({default:m.CashJournalPage})))
const CustomersPage=lazy(()=>import('./pages/CustomersPage').then(m=>({default:m.CustomersPage})))
const CustomerReturnsPage=lazy(()=>import('./pages/CustomerReturnsPage').then(m=>({default:m.CustomerReturnsPage})))
const SupplierReturnsPage=lazy(()=>import('./pages/SupplierReturnsPage').then(m=>({default:m.SupplierReturnsPage})))
const ReportsPage=lazy(()=>import('./pages/ReportsPage').then(m=>({default:m.ReportsPage})))
const SettingsPage=lazy(()=>import('./pages/SettingsPage').then(m=>({default:m.SettingsPage})))
const AuditPage=lazy(()=>import('./pages/admin/AuditPage').then(m=>({default:m.AuditPage})))
const DiagnosticPage=lazy(()=>import('./pages/admin/DiagnosticPage').then(m=>({default:m.DiagnosticPage})))

function HomeRoute(){const{profile}=useAuth();return profile?.role==='cuisine'?<Navigate to="/cuisine" replace/>:<DashboardPage/>}
const loading=<div className="grid min-h-64 place-items-center font-semibold text-slate-500">Chargement…</div>

export function App(){return <Suspense fallback={loading}><Routes>
  <Route path="/login" element={<LoginPage/>}/>
  <Route element={<ProtectedRoute/>}><Route element={<AppLayout/>}>
    <Route index element={<HomeRoute/>}/>
    <Route element={<RoleRoute roles={['admin','gestionnaire','caissier']}/>}><Route path="caisse" element={<PosPage/>}/><Route path="caisse/journal" element={<CashJournalPage/>}/></Route>
    <Route element={<RoleRoute roles={['admin','gestionnaire','serveur']}/>}><Route path="tables" element={<TablesPage/>}/></Route>
    <Route element={<RoleRoute roles={['admin','gestionnaire','caissier','serveur']}/>}><Route path="commandes" element={<OrdersPage/>}/><Route path="produits" element={<ProductsPage/>}/><Route path="clients" element={<CustomersPage/>}/><Route path="retours" element={<CustomerReturnsPage/>}/></Route>
    <Route element={<RoleRoute roles={['admin','gestionnaire','cuisine']}/>}><Route path="cuisine" element={<KitchenPage/>}/></Route>
    <Route element={<RoleRoute roles={['admin','gestionnaire']}/>}><Route path="stock" element={<StockPage/>}/><Route path="stock/recettes" element={<RecipesPage/>}/><Route path="stock/inventaires" element={<InventoriesPage/>}/><Route path="achats" element={<PurchasesPage/>}/><Route path="achats/retours" element={<SupplierReturnsPage/>}/><Route path="fournisseurs" element={<SuppliersPage/>}/><Route path="depenses" element={<ExpensesPage/>}/><Route path="rapports" element={<ReportsPage/>}/><Route path="parametres" element={<SettingsPage/>}/></Route>
    <Route element={<RoleRoute roles={['admin']}/>}><Route path="admin/audit" element={<AuditPage/>}/><Route path="admin/diagnostic" element={<DiagnosticPage/>}/></Route>
  </Route></Route>
  <Route path="*" element={<Navigate to="/" replace/>}/>
</Routes></Suspense>}
