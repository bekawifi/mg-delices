import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { Role } from '../types/database'
import { hasRoleAccess } from '../lib/users'

export function RoleRoute({ roles }: { roles: Role[] }) {
  const { profile } = useAuth()
  return profile && hasRoleAccess(profile.role, roles) ? <Outlet /> : <Navigate to="/" replace />
}
