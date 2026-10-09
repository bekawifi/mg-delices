import { useState, type FormEvent } from "react";
import { PageHeader } from "../components/PageHeader";
import { FormField } from "../components/forms/FormField";
import { useAuth } from "../contexts/AuthContext";
import { userMessageFromError } from "../lib/errors";
import { supabase } from "../lib/supabase";
import { roleLabel } from "../lib/users";

export function MyProfilePage() {
  const { user, profile } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return;
    setError(""); setNotice("");
    if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères."); return; }
    if (password !== confirmation) { setError("Les mots de passe ne correspondent pas."); return; }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) setError(userMessageFromError(updateError, "Le mot de passe n’a pas pu être modifié."));
    else { setPassword(""); setConfirmation(""); setNotice("Mot de passe modifié."); }
    setBusy(false);
  };
  return <>
    <PageHeader title="Mon profil" description="Informations du compte connecté et sécurité personnelle." />
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-6"><h2 className="text-lg font-black text-slate-900">Identité</h2><dl className="mt-5 space-y-4"><Info label="Nom" value={profile?.full_name || "—"} /><Info label="Email" value={user?.email || "—"} /><Info label="Rôle" value={profile ? roleLabel(profile.role) : "—"} /><Info label="Statut" value={profile?.is_active ? "Actif" : "Inactif"} /><Info label="Dernière connexion" value={profile?.last_login_at ? new Date(profile.last_login_at).toLocaleString("fr-FR") : "Jamais"} /></dl></section>
      <form className="card overflow-hidden" onSubmit={changePassword}><div className="p-6"><h2 className="text-lg font-black text-slate-900">Changer mon mot de passe</h2><p className="mt-1 text-sm text-slate-500">La modification est appliquée par Supabase Auth à votre session connectée.</p>{notice && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-5 space-y-4"><FormField label="Nouveau mot de passe" htmlFor="new-password" required><input id="new-password" className="field" type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></FormField><FormField label="Confirmation" htmlFor="confirm-password" required><input id="confirm-password" className="field" type="password" minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></FormField></div></div><div className="flex justify-end border-t border-slate-200 bg-slate-50 px-6 py-4"><button className="btn-primary" type="submit" disabled={busy || !password || !confirmation}>{busy ? "Modification…" : "Modifier le mot de passe"}</button></div></form>
    </div>
  </>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-900">{value}</dd></div>;
}
