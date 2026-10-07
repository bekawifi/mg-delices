import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LoaderCircle } from 'lucide-react'

export function ProtectedRoute() {
  const { user, profile, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="grid min-h-screen place-items-center bg-brand-900"><LoaderCircle className="animate-spin text-gold-400" size={40} /></div>
  if (!user || !profile?.is_active) return <Navigate to="/login" state={{ from: location }} replace />
  return <Outlet />
}
