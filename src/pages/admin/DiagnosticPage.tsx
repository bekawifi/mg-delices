import { useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { PageHeader } from '../../components/PageHeader'
import { useAuth } from '../../contexts/AuthContext'
import { userMessageFromError } from '../../lib/errors'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { downloadSupportDiagnostic, supportLog } from '../../lib/supportLogs'
import { checkForUpdate } from '../../lib/updater'
import { APP_IDENTIFIER, APP_VERSION } from '../../lib/version'

const endpoint = (() => { try { const host = new URL(import.meta.env.VITE_SUPABASE_URL || '').host; return host ? `${host.slice(0, 4)}••••${host.slice(-12)}` : '—' } catch { return 'invalide' } })()

export function DiagnosticPage() {
  const { user, profile } = useAuth()
  const [result, setResult] = useState('Non exécuté')
  const [updater, setUpdater] = useState('Non vérifié')
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const check = async () => {
    setBusy(true); const started = performance.now()
    const [{ error: profileError }, { error: rpcError }, session, update] = await Promise.all([
      supabase.from('profiles').select('id').eq('id', user?.id || '').maybeSingle(), supabase.rpc('get_restaurant_settings'), supabase.auth.getSession(), checkForUpdate(),
    ])
    const failure = profileError || rpcError || session.error
    const message = failure ? userMessageFromError(failure) : `Auth et RPC opérationnels · latence ${Math.round(performance.now()-started)} ms`
    const updateMessage = update.status === 'available' ? `Version ${update.version} disponible` : update.status === 'up-to-date' ? 'À jour' : update.status === 'unavailable' ? 'Web — indisponible' : update.message
    setResult(message); setUpdater(updateMessage); setCheckedAt(new Date().toLocaleString('fr-FR')); supportLog(failure ? 'error' : 'info', message); setBusy(false)
  }
  const rows = [['Version',APP_VERSION],['Identifiant',APP_IDENTIFIER],['Environnement',import.meta.env.PROD?'production':'développement'],['Endpoint Supabase',endpoint],['Configuration Supabase',isSupabaseConfigured?'présente':'incomplète'],['État Auth',user?'connecté':'déconnecté'],['Utilisateur',user?.email||'—'],['Rôle',profile?.role||'—'],['État réseau',navigator.onLine?'en ligne':'hors ligne'],['État updater',updater],['Dernière vérification',checkedAt||'Jamais'],['Migration attendue','20261008000100']]
  return <><PageHeader title="Diagnostic administration" description="Contrôles non destructifs et export support sans secrets."/><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map(([label,value])=><div key={label} className="card p-5"><p className="text-sm text-slate-500">{label}</p><b className="break-all">{value}</b></div>)}</div><section className="card mt-5 p-5"><h2 className="font-black">Tests de connexion</h2><p className="my-3">{result}</p><div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={busy} onClick={()=>void check()}><RefreshCw size={18}/>{busy?'Vérification…':'Exécuter les contrôles'}</button><button className="btn-secondary" onClick={()=>downloadSupportDiagnostic({Rôle:profile?.role||'—',Réseau:navigator.onLine?'en ligne':'hors ligne',Résultat:result,Updater:updater})}><Download size={18}/>Exporter diagnostic</button></div></section></>
}
