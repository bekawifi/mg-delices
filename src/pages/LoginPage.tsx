import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, Utensils } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
import { APP_NAME } from '../lib/version'

export function LoginPage() {
  const { user, profile, signIn, error: authError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  if (user && profile) return <Navigate to="/" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try { await signIn(email.trim(), password); navigate((location.state as { from?: { pathname?: string } })?.from?.pathname || '/', { replace: true }) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Connexion impossible.') }
    finally { setBusy(false) }
  }
  return <div className="grid min-h-screen bg-slate-50 lg:grid-cols-2">
    <section className="hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-gold-400 text-brand-900"><Utensils /></div><span className="text-2xl font-black">{APP_NAME}</span></div>
      <div className="max-w-xl"><p className="text-5xl font-black leading-tight">Votre restaurant,<br/><span className="text-gold-400">parfaitement piloté.</span></p><p className="mt-6 text-lg text-brand-100">Ventes, menu et performances réunis dans une interface rapide et intuitive.</p></div>
      <p className="text-sm text-brand-100/70">{APP_NAME} · Gestion professionnelle</p>
    </section>
    <section className="flex items-center justify-center p-6"><div className="w-full max-w-md">
      <div className="mb-8 lg:hidden"><p className="text-2xl font-black text-brand-900">{APP_NAME}</p></div>
      <h1 className="text-3xl font-black">Bienvenue</h1><p className="mt-2 text-slate-500">Connectez-vous à votre espace de gestion.</p>
      {!isSupabaseConfigured && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Configurez d’abord <code>.env</code> avec vos identifiants Supabase.</div>}
      <form onSubmit={submit} className="mt-8 space-y-5">
        <div><label className="label" htmlFor="email">Adresse email</label><div className="relative"><Mail className="absolute left-3 top-3.5 text-slate-400" size={19}/><input id="email" className="field pl-10" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nom@restaurant.com" required /></div></div>
        <div><label className="label" htmlFor="password">Mot de passe</label><div className="relative"><LockKeyhole className="absolute left-3 top-3.5 text-slate-400" size={19}/><input id="password" className="field px-10" type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required /><button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-3.5 text-slate-400" aria-label="Afficher le mot de passe">{show ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div></div>
        {(error || authError) && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error || authError}</p>}
        <button disabled={busy || !isSupabaseConfigured} className="btn-primary w-full">{busy && <LoaderCircle className="animate-spin" size={18}/>}Se connecter</button>
      </form>
    </div></section>
  </div>
}
