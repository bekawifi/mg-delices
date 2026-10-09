import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { userMessageFromError } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { APP_NAME } from "../lib/version";

export function AuthCompletionPage() {
  const { user, loading, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user && !done) setError("Ce lien est invalide ou expiré. Demandez une nouvelle invitation ou récupération.");
  }, [done, loading, user]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères."); return; }
    if (password !== confirmation) { setError("Les mots de passe ne correspondent pas."); return; }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) setError(userMessageFromError(updateError, "Le mot de passe n’a pas pu être défini."));
    else { setDone(true); setPassword(""); setConfirmation(""); await signOut(); }
    setBusy(false);
  };

  return <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
    <section className="card w-full max-w-md overflow-hidden">
      <div className="border-b border-slate-200 px-6 py-5">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-600">{APP_NAME}</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">Finaliser votre accès</h1>
        <p className="mt-2 text-sm text-slate-500">Définissez votre mot de passe depuis ce lien sécurisé.</p>
      </div>
      {loading ? <div className="grid min-h-52 place-items-center"><LoaderCircle className="animate-spin text-brand-600" /></div> : done ? <div className="p-6 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={44} /><h2 className="mt-3 text-lg font-black">Mot de passe enregistré</h2><p className="mt-2 text-sm text-slate-600">Vous pouvez fermer cette page et vous connecter dans RestoPRO.</p></div> : <form onSubmit={submit}>
        <div className="space-y-4 p-6">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-700"><KeyRound /></div>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div><label className="label" htmlFor="completion-password">Nouveau mot de passe</label><input id="completion-password" className="field" type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
          <div><label className="label" htmlFor="completion-confirmation">Confirmation</label><input id="completion-confirmation" className="field" type="password" minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></div>
        </div>
        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-6 py-4"><button className="btn-primary" type="submit" disabled={busy || !user}>{busy ? "Enregistrement…" : "Définir le mot de passe"}</button></div>
      </form>}
    </section>
  </main>;
}
