import { supabase } from "./supabase";
import type { Role } from "../types/database";

export type AccessRole = Role;

export interface UserProfileSummary {
  id: string;
  full_name: string;
  email: string;
  role: AccessRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserActivity {
  id: number;
  created_at: string;
  action: string;
  domaine: string;
  objet_type: string;
  objet_id: string | null;
  reference_metier: string | null;
  donnees_avant: unknown;
  donnees_apres: unknown;
  contexte: unknown;
}

export const roleOptions: Array<{ value: AccessRole; label: string }> = [
  { value: "super_admin", label: "Super administrateur" },
  { value: "admin", label: "Administrateur" },
  { value: "gestionnaire", label: "Gestionnaire" },
  { value: "caissier", label: "Caissier" },
  { value: "serveur", label: "Serveur" },
  { value: "cuisine", label: "Cuisine" },
];

export function roleLabel(role: AccessRole) {
  return roleOptions.find((option) => option.value === role)?.label || role;
}

export function hasRoleAccess(role: AccessRole | undefined, allowed: AccessRole[]) {
  if (!role) return false;
  return allowed.includes(role) || (role === "super_admin" && allowed.includes("admin"));
}

export function canManageTarget(caller: AccessRole | undefined, target: AccessRole, nextRole = target) {
  if (caller === "super_admin") return true;
  return caller === "admin" && !["admin", "super_admin"].includes(target) && !["admin", "super_admin"].includes(nextRole);
}

export async function listUsers(filters: { search?: string; role?: string; active?: boolean | null } = {}) {
  const { data, error } = await supabase.rpc("list_user_profiles", {
    p_search: filters.search?.trim() || null,
    p_role: filters.role || null,
    p_active: filters.active ?? null,
    p_limit: 200,
    p_offset: 0,
  });
  if (error) throw error;
  return ((data as { rows?: UserProfileSummary[] })?.rows || []);
}

export async function getUserProfile(userId: string) {
  const { data, error } = await supabase.rpc("get_user_profile", { p_user_id: userId });
  if (error) throw error;
  return data as UserProfileSummary;
}

export async function updateUserProfile(user: Pick<UserProfileSummary, "id" | "full_name" | "role" | "is_active">) {
  const { data, error } = await supabase.rpc("update_user_profile", {
    p_user_id: user.id,
    p_full_name: user.full_name,
    p_role: user.role,
    p_is_active: user.is_active,
  });
  if (error) throw error;
  return data as UserProfileSummary;
}

export async function createUser(input: Pick<UserProfileSummary, "full_name" | "email" | "role" | "is_active">) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body: { action: "create", ...input } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.user as UserProfileSummary;
}

export async function sendPasswordReset(userId: string) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body: { action: "send_password_reset", user_id: userId } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export async function getUserActivity(userId: string, filters: { from?: string; to?: string; domain?: string; action?: string } = {}) {
  const { data, error } = await supabase.rpc("get_user_activity", {
    p_user_id: userId, p_from: filters.from || null, p_to: filters.to || null,
    p_domain: filters.domain?.trim() || null, p_action: filters.action?.trim() || null,
    p_limit: 100, p_offset: 0,
  });
  if (error) throw error;
  return ((data as { rows?: UserActivity[] })?.rows || []);
}
