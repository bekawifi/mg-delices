import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useAuth } from '../../contexts/AuthContext'
import { CashSessionStatus } from '../CashSessionStatus'
import { useRestaurantSettings } from '../../contexts/RestaurantSettingsContext'
import { APP_NAME } from '../../lib/version'

export function AppLayout() {
  const [open, setOpen] = useState(false)
  const { profile } = useAuth()
  const { settings } = useRestaurantSettings()
  useEffect(()=>{document.title=`${APP_NAME} — ${settings.nom}`},[settings.nom])
  return <div className="min-h-screen bg-slate-50 lg:pl-64">
    <Sidebar open={open} onClose={() => setOpen(false)} />
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-white/95 px-4 backdrop-blur lg:px-8">
      <button className="rounded-xl p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Ouvrir le menu"><Menu /></button>
      <div className="ml-auto flex items-center"><CashSessionStatus/><div className="text-right">
        <p className="text-sm font-bold text-slate-800">{profile?.full_name}</p>
        <p className="text-xs capitalize text-slate-500">{profile?.role}</p>
      </div></div>
    </header>
    <main className="p-4 lg:p-8"><Outlet /></main>
  </div>
}
