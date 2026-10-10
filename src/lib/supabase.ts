import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

function readJwtRole(key: string | undefined) {
  try {
    if (!key) return null
    const payload = key.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return (JSON.parse(atob(padded)) as { role?: string }).role || null
  } catch { return null }
}

const isSecretKey = Boolean(anonKey?.startsWith('sb_secret_'))
const hasSafePublicKey = Boolean(anonKey && !isSecretKey && readJwtRole(anonKey) !== 'service_role')
export const isSupabaseConfigured = Boolean(url && anonKey && hasSafePublicKey && !url.includes('votre-projet'))

if (anonKey && (isSecretKey || readJwtRole(anonKey) === 'service_role')) {
  console.error('Configuration Supabase refusée : utilisez exclusivement la clé publique anon/publishable.')
}

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  isSupabaseConfigured && anonKey ? anonKey : 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)
