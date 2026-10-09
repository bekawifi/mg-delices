import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { formatMoney } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { CashSummary } from '../types/cash'

export function CashSessionStatus() {
  const { profile } = useAuth()
  const [summary, setSummary] = useState<CashSummary | null>(null)
  const canUseCash = ['admin', 'gestionnaire', 'caissier'].includes(profile?.role || '')
  const refresh = useCallback(async () => {
    if (!canUseCash) return
    const { data, error } = await supabase.rpc('get_cash_session_summary', { p_session_id: null })
    if (!error) setSummary(data as CashSummary | null)
  }, [canUseCash])
  useEffect(() => {
    void refresh()
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(onFocus, 60_000)
    return () => { window.removeEventListener('focus', onFocus); window.clearInterval(timer) }
  }, [refresh])
  if (!canUseCash) return null
  return <Link to="/caisse/journal" className={`mr-3 hidden rounded-xl px-3 py-2 text-xs font-black sm:block ${summary ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
    <span className="block">{summary ? 'CAISSE OUVERTE' : 'CAISSE FERMÉE'}</span>
    {summary && <span className="font-medium">{new Date(summary.opened_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {formatMoney(summary.solde_theorique)}</span>}
  </Link>
}
