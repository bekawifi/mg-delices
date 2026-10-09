import "../../scripts/assert-test-environment.mjs";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

for (const name of [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "TEST_ADMIN_EMAIL",
  "TEST_ADMIN_PASSWORD",
  "TEST_CASHIER_EMAIL",
  "TEST_CASHIER_PASSWORD",
]) assert.ok(process.env[name], `Variable manquante : ${name}`);

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
async function login(email, password) {
  const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, options);
  const result = await db.auth.signInWithPassword({ email, password });
  assert.ifError(result.error);
  return db;
}

const admin = await login(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);
const cashier = await login(process.env.TEST_CASHIER_EMAIL, process.env.TEST_CASHIER_PASSWORD);
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const name = `Client caisse ${suffix}`;
const phone = `test-${suffix}`;
const payload = {
  p_id: null,
  p_nom: name,
  p_telephone: phone,
  p_email: null,
  p_adresse: null,
  p_plafond_credit: 0,
  p_actif: true,
};

console.log("1/5 Le caissier crée un client actif sans crédit initial");
const created = await cashier.rpc("save_customer", payload);
assert.ifError(created.error);
assert.ok(created.data);

console.log("2/5 Le client créé est immédiatement disponible pour la caisse");
const overview = await cashier.rpc("get_customers_overview", { p_search: name, p_only_with_debt: false });
assert.ifError(overview.error);
const customer = overview.data.find((item) => item.id === created.data);
assert.ok(customer);
assert.equal(customer.actif, true);
assert.equal(Number(customer.plafond_credit), 0);

console.log("3/5 Le caissier ne peut ni modifier un client ni attribuer un crédit");
const forbiddenUpdate = await cashier.rpc("save_customer", { ...payload, p_id: created.data, p_nom: `${name} modifié` });
assert.ok(forbiddenUpdate.error);
assert.match(forbiddenUpdate.error.message, /non autorisée/i);
const forbiddenCredit = await cashier.rpc("save_customer", { ...payload, p_nom: `${name} crédit`, p_plafond_credit: 1 });
assert.ok(forbiddenCredit.error);
assert.match(forbiddenCredit.error.message, /non autorisée/i);

console.log("4/5 Une erreur de création est explicite et ne crée aucun doublon");
const duplicate = await cashier.rpc("save_customer", { ...payload, p_nom: `${name} doublon` });
assert.ok(duplicate.error);
assert.match(duplicate.error.message, /utilise déjà ce téléphone/i);
const afterDuplicate = await cashier.rpc("get_customers_overview", { p_search: phone, p_only_with_debt: false });
assert.ifError(afterDuplicate.error);
assert.equal(afterDuplicate.data.filter((item) => item.telephone === phone).length, 1);

console.log("5/5 Nettoyage fonctionnel par désactivation administrateur");
const cleanup = await admin.rpc("save_customer", { ...payload, p_id: created.data, p_actif: false });
assert.ifError(cleanup.error);

console.log("Tous les tests d’intégration de création rapide client sont réussis.");
