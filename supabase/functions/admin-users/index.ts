import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

type CreateBody = {
  action: "create";
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
};
type ResetBody = { action: "send_password_reset"; user_id: string };

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Methode non autorisee" });

  const url = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authRedirectUrl = Deno.env.get("RESTOPRO_AUTH_REDIRECT_URL");
  const authorization = request.headers.get("Authorization");
  if (!url || !publicKey || !serviceKey || !authorization?.startsWith("Bearer ")) {
    return json(401, { error: "Authentification requise" });
  }
  if (!authRedirectUrl) return json(500, { error: "Redirect Auth RestoPRO non configure" });

  const caller = createClient(url, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await caller.rpc("get_my_profile");
  if (callerError || !callerData?.is_active || !["admin", "super_admin"].includes(callerData.role)) {
    return json(403, { error: "Action non autorisee" });
  }

  let body: CreateBody | ResetBody;
  try { body = await request.json(); }
  catch { return json(400, { error: "Requete invalide" }); }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (body.action === "create") {
    const email = body.email?.trim().toLowerCase();
    const fullName = body.full_name?.trim();
    const roles = ["super_admin", "admin", "gestionnaire", "caissier", "serveur", "cuisine"];
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || !fullName || !roles.includes(body.role) || typeof body.is_active !== "boolean") {
      return json(400, { error: "Informations utilisateur invalides" });
    }
    if (callerData.role !== "super_admin" && ["super_admin", "admin"].includes(body.role)) {
      return json(403, { error: "Action reservee au super administrateur" });
    }

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: authRedirectUrl,
    });
    if (inviteError || !invited.user) return json(400, { error: inviteError?.message || "Invitation impossible" });

    const configured = await caller.rpc("update_user_profile", {
      p_user_id: invited.user.id,
      p_full_name: fullName,
      p_role: body.role,
      p_is_active: body.is_active,
    });
    if (configured.error) {
      await admin.auth.admin.deleteUser(invited.user.id);
      return json(400, { error: configured.error.message });
    }
    return json(201, { user: configured.data, invitation_sent: true });
  }

  if (body.action === "send_password_reset") {
    if (!body.user_id) return json(400, { error: "Utilisateur invalide" });
    const target = await caller.rpc("get_user_profile", { p_user_id: body.user_id });
    if (target.error || !target.data?.email) return json(403, { error: target.error?.message || "Action non autorisee" });
    const resetClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await resetClient.auth.resetPasswordForEmail(target.data.email, { redirectTo: authRedirectUrl });
    if (error) return json(400, { error: error.message });
    return json(200, { password_reset_sent: true });
  }

  return json(400, { error: "Action inconnue" });
});
