import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Profile } from '../types/database'
import { userMessageFromError } from '../lib/errors'

interface AuthValue {
  user: User | null
  profile: Profile | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProfile = async (userId: string) => {
    const { data, error: profileError } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (profileError) {
      await supabase.auth.signOut()
      throw new Error(userMessageFromError(profileError, 'Impossible de vérifier votre profil. Réessayez.'))
    }
    if (!data) {
      await supabase.auth.signOut()
      throw new Error('Votre compte est désactivé ou inaccessible. Contactez un administrateur.')
    }
    const loaded = data as Profile
    if (loaded.is_super_admin) loaded.role = 'super_admin'
    if (!loaded.is_active) {
      await supabase.auth.signOut()
      throw new Error('Votre compte est désactivé. Contactez un administrateur.')
    }
    await supabase.rpc('record_current_user_login')
    setProfile(loaded)
  }

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    const isAuthCompletion = typeof window !== 'undefined' && window.location.pathname === '/auth/complete'
    supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (sessionError) setError(userMessageFromError(sessionError, 'Impossible de restaurer votre session.'))
      setSession(data.session)
      if (data.session && !isAuthCompletion) {
        try { await loadProfile(data.session.user.id) }
        catch (caught) { setError(caught instanceof Error ? caught.message : 'Profil inaccessible') }
      }
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (!next) setProfile(null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    setError(null)
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) throw new Error(userMessageFromError(authError, 'Email ou mot de passe incorrect.'))
    if (!data.user) throw new Error('Connexion impossible.')
    try { await loadProfile(data.user.id) }
    catch (caught) { await supabase.auth.signOut(); throw caught }
  }

  const signOut = async () => { await supabase.auth.signOut(); setProfile(null) }
  const refreshProfile = async () => { if (session?.user) await loadProfile(session.user.id) }
  const value = useMemo(() => ({ user: session?.user ?? null, profile, loading, error, signIn, signOut, refreshProfile }), [session, profile, loading, error])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return context
}
