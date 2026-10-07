import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { Role } from '../types/database'

export function RoleRoute({ roles }: { roles: Role[] }) {
  const { profile } = useAuth()
  return profile && roles.includes(profile.role) ? <Outlet /> : <Navigate to="/" replace />
}
