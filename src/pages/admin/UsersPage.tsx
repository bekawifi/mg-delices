import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Edit3, KeyRound, LoaderCircle, Plus, Search, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/EmptyState";
import { FormField, ToggleField } from "../../components/forms/FormField";
import { FormModal } from "../../components/forms/FormModal";
import { useAuth } from "../../contexts/AuthContext";
import { userMessageFromError } from "../../lib/errors";
import {
  canManageTarget, createUser, listUsers, roleLabel, roleOptions,
  sendPasswordReset, updateUserProfile, type UserProfileSummary,
} from "../../lib/users";
import type { Role } from "../../types/database";

const emptyForm = { id: "", full_name: "", email: "", role: "caissier" as Role, is_active: true };

export function UsersPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<UserProfileSummary | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try { setUsers(await listUsers()); }
    catch (caught) { setError(userMessageFromError(caught, "Impossible de charger les utilisateurs.")); }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => users.filter((user) => {
    const query = search.trim().toLowerCase();
    return (!query || user.full_name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query))
      && (!role || user.role === role)
      && (!status || user.is_active === (status === "active"));
  }), [users, search, role, status]);

  const availableRoles = roleOptions.filter((option) => profile?.role === "super_admin" || !["super_admin", "admin"].includes(option.value));
  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setError(""); setModal(true); };
  const openEdit = (user: UserProfileSummary) => {
    setEditing(user);
    setForm({ id: user.id, full_name: user.full_name, email: user.email, role: user.role, is_active: user.is_active });
    setError(""); setModal(true);
  };
  const close = () => { if (!busy) setModal(false); };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (editing) await updateUserProfile({ id: editing.id, full_name: form.full_name.trim(), role: form.role, is_active: form.is_active });
      else await createUser({ full_name: form.full_name.trim(), email: form.email.trim(), role: form.role, is_active: form.is_active });
      setModal(false); setNotice(editing ? "Utilisateur mis à jour." : "Invitation envoyée et utilisateur créé.");
      await load();
    } catch (caught) { setError(userMessageFromError(caught, "L’utilisateur n’a pas pu être enregistré.")); }
    finally { setBusy(false); }
  };
  const resetPassword = async (user: UserProfileSummary) => {
    setError(""); setNotice("");
    try { await sendPasswordReset(user.id); setNotice(`Email de réinitialisation envoyé à ${user.email}.`); }
    catch (caught) { setError(userMessageFromError(caught, "La réinitialisation du mot de passe a échoué.")); }
  };

  return <>
    <PageHeader title="Utilisateurs" description="Comptes, rôles, activation et accès RestoPRO." action={<button className="btn-primary" onClick={openCreate}><Plus size={19} />Nouvel utilisateur</button>} />
    <div className="card mb-5 grid gap-3 p-4 md:grid-cols-[1fr_220px_180px]">
      <div className="relative"><Search className="absolute left-3 top-3.5 text-slate-400" size={18} /><input className="field pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom ou email…" /></div>
      <select className="field" value={role} onChange={(event) => setRole(event.target.value)}><option value="">Tous les rôles</option>{roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      <select className="field" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tous les statuts</option><option value="active">Actifs</option><option value="inactive">Inactifs</option></select>
    </div>
    {notice && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    {error && !modal && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="card overflow-hidden">{loading ? <div className="grid min-h-60 place-items-center"><LoaderCircle className="animate-spin text-brand-600" /></div> : filtered.length === 0 ? <EmptyState title="Aucun utilisateur" message="Aucun compte ne correspond aux filtres." /> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Utilisateur</th><th className="px-5 py-4">Rôle</th><th className="px-5 py-4">Statut</th><th className="px-5 py-4">Dernière connexion</th><th className="px-5 py-4">Créé le</th><th className="px-5 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y">{filtered.map((user) => {
      const manageable = canManageTarget(profile?.role, user.role);
      return <tr key={user.id} className="hover:bg-slate-50/70"><td className="px-5 py-4">{manageable ? <button className="text-left" onClick={() => void navigate(`/admin/utilisateurs/${user.id}`)}><span className="block font-bold text-slate-900">{user.full_name}</span><span className="text-xs text-slate-500">{user.email}</span></button> : <><span className="block font-bold text-slate-900">{user.full_name}</span><span className="text-xs text-slate-500">{user.email}</span></>}</td><td className="px-5 py-4 font-semibold">{roleLabel(user.role)}</td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${user.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{user.is_active ? "Actif" : "Inactif"}</span></td><td className="px-5 py-4 text-slate-600">{user.last_login_at ? new Date(user.last_login_at).toLocaleString("fr-FR") : "Jamais"}</td><td className="px-5 py-4 text-slate-600">{new Date(user.created_at).toLocaleDateString("fr-FR")}</td><td className="px-5 py-4"><div className="flex justify-end gap-1">{manageable && <><button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" onClick={() => void navigate(`/admin/utilisateurs/${user.id}`)} aria-label={`Voir ${user.full_name}`}><UserRound size={18} /></button><button className="rounded-lg p-2 text-brand-600 hover:bg-brand-50" onClick={() => openEdit(user)} aria-label={`Modifier ${user.full_name}`}><Edit3 size={18} /></button><button className="rounded-lg p-2 text-amber-600 hover:bg-amber-50" onClick={() => void resetPassword(user)} aria-label={`Réinitialiser le mot de passe de ${user.full_name}`}><KeyRound size={18} /></button></>}</div></td></tr>;
    })}</tbody></table></div>}</div>
    {modal && <FormModal title={editing ? "Modifier l’utilisateur" : "Nouvel utilisateur"} eyebrow="Compte RestoPRO" onClose={close} onSubmit={save} busy={busy} error={error} submitLabel={editing ? "Enregistrer" : "Envoyer l’invitation"} submitDisabled={!form.full_name.trim() || (!editing && !form.email.trim())}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Nom complet" htmlFor="user-name" required><input id="user-name" autoFocus className="field" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required /></FormField>
        <FormField label="Email" htmlFor="user-email" required hint={editing ? "L’email Auth ne se modifie pas depuis cette fiche." : "Une invitation sécurisée sera envoyée."}><input id="user-email" className="field" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required disabled={Boolean(editing)} /></FormField>
        <FormField label="Rôle" htmlFor="user-role" required className="sm:col-span-2"><select id="user-role" className="field" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>{availableRoles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></FormField>
        <div className="sm:col-span-2"><ToggleField label="Compte actif" description="Un compte inactif ne peut pas ouvrir de session ni utiliser les RPC métier." checked={form.is_active} onChange={(is_active) => setForm({ ...form, is_active })} disabled={busy} /></div>
      </div>
    </FormModal>}
  </>;
}
