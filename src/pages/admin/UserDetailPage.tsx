import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { userMessageFromError } from "../../lib/errors";
import { getUserActivity, getUserProfile, roleLabel, type UserActivity, type UserProfileSummary } from "../../lib/users";

export function UserDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfileSummary | null>(null);
  const [activity, setActivity] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ from: "", to: "", domain: "", action: "" });
  useEffect(() => {
    let active = true;
    Promise.all([getUserProfile(id), getUserActivity(id, filters)]).then(([profile, rows]) => {
      if (active) { setUser(profile); setActivity(rows); }
    }).catch((caught) => { if (active) setError(userMessageFromError(caught, "Impossible de charger cette fiche utilisateur.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, filters.from, filters.to, filters.domain, filters.action]);
  if (loading) return <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin text-brand-600" /></div>;
  return <>
    <PageHeader title={user?.full_name || "Fiche utilisateur"} description="Identité, statut et activité enregistrée dans le journal d’audit." action={<button className="btn-secondary" onClick={() => navigate("/admin/utilisateurs")}><ArrowLeft size={18} />Utilisateurs</button>} />
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {user && <div className="card mb-6 grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4"><Info label="Email" value={user.email} /><Info label="Rôle" value={roleLabel(user.role)} /><Info label="Statut" value={user.is_active ? "Actif" : "Inactif"} /><Info label="Dernière connexion" value={user.last_login_at ? new Date(user.last_login_at).toLocaleString("fr-FR") : "Jamais"} /><Info label="Création" value={new Date(user.created_at).toLocaleString("fr-FR")} /><Info label="Dernière modification" value={new Date(user.updated_at).toLocaleString("fr-FR")} /></div>}
    <h2 className="mb-3 text-lg font-black text-slate-900">Activité récente</h2>
    <div className="card mb-4 grid gap-3 p-4 md:grid-cols-4"><input className="field" type="date" aria-label="Activité depuis" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /><input className="field" type="date" aria-label="Activité jusqu’au" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /><input className="field" placeholder="Domaine" value={filters.domain} onChange={(event) => setFilters({ ...filters, domain: event.target.value })} /><input className="field" placeholder="Action" value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} /></div>
    <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Date</th><th className="px-5 py-4">Domaine</th><th className="px-5 py-4">Action</th><th className="px-5 py-4">Objet</th><th className="px-5 py-4">Référence</th><th className="px-5 py-4">Détails</th></tr></thead><tbody className="divide-y">{activity.map((row) => <tr key={row.id}><td className="px-5 py-4">{new Date(row.created_at).toLocaleString("fr-FR")}</td><td className="px-5 py-4">{row.domaine}</td><td className="px-5 py-4 font-semibold">{row.action}</td><td className="px-5 py-4">{row.objet_type}</td><td className="px-5 py-4">{row.reference_metier || row.objet_id || "—"}</td><td className="px-5 py-4"><details><summary className="cursor-pointer text-brand-700">Voir</summary><pre className="mt-2 max-w-lg overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify({ avant: row.donnees_avant, apres: row.donnees_apres, contexte: row.contexte }, null, 2)}</pre></details></td></tr>)}</tbody></table>{activity.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Aucune activité auditée pour cet utilisateur.</p>}</div></div>
  </>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-900">{value}</p></div>;
}
