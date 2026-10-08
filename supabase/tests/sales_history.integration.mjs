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
]) {
  assert.ok(process.env[name], `Variable manquante : ${name}`);
}

const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};
async function login(email, password) {
  const db = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    options,
  );
  const result = await db.auth.signInWithPassword({ email, password });
  assert.ifError(result.error);
  return db;
}
const admin = await login(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);
const cashier = await login(process.env.TEST_CASHIER_EMAIL, process.env.TEST_CASHIER_PASSWORD);
const search = async (db, values = {}) => {
  const result = await db.rpc("search_sales_history", {
    p_search: null,
    p_date: null,
    p_limit: 10,
    p_offset: 0,
    ...values,
  });
  assert.ifError(result.error);
  return result.data;
};

console.log("1/7 Liste récente limitée côté serveur");
const recent = await search(cashier);
assert.ok(recent.rows.length <= 10);
assert.deepEqual(
  [...recent.rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  recent.rows,
);

console.log("2/7 Recherche de MG-20261008-0115");
const exact = await search(admin, { p_search: "MG-20261008-0115", p_limit: 25 });
assert.equal(exact.rows.length, 1);
const sale = exact.rows[0];
assert.equal(Number(sale.total_final), 1200);
assert.equal(sale.mode_paiement, "especes");

console.log("3/7 Reçu historique détaillé");
const receiptResult = await admin.rpc("get_sale_receipt", { p_sale_id: sale.id });
assert.ifError(receiptResult.error);
const receipt = receiptResult.data;
assert.equal(receipt.lignes.length, 2);
assert.deepEqual(
  receipt.lignes.map((line) => [
    line.nom_produit,
    Number(line.prix_unitaire),
    Number(line.total_ligne),
  ]),
  [
    ["Coca-Cola", 700, 700],
    ["Eau", 500, 500],
  ],
);
assert.equal(Number(receipt.vente.total_final), 1200);
assert.equal(Number(receipt.vente.monnaie_rendue), 300);

console.log("4/7 Recherche par date");
const filterDate = sale.created_at.slice(0, 10);
const startUtc = new Date(`${filterDate}T00:00:00.000Z`);
const endUtc = new Date(startUtc);
endUtc.setUTCDate(endUtc.getUTCDate() + 1);
const datePage = await search(admin, { p_date: filterDate, p_limit: 50 });
console.log("Diagnostic recherche par date", {
  sale_id: sale.id,
  sale_created_at: sale.created_at,
  date_filtre: filterDate,
  convention_timezone: "UTC (date ISO de created_at ; PostgreSQL Supabase en UTC)",
  borne_debut_inclusive: startUtc.toISOString(),
  borne_fin_exclusive: endUtc.toISOString(),
  predicat_rpc_actuel: "created_at::date = p_date",
  total_correspondant: datePage.total,
  lignes_retournees: datePage.rows.map((row) => ({ id: row.id, created_at: row.created_at })),
});
// Le filtre unique empêche les ventes plus récentes du même jour d'évincer
// la vente cible de la première page, tout en validant simultanément la date.
const byDate = await search(admin, {
  p_date: filterDate,
  p_search: sale.numero,
  p_limit: 50,
});
assert.ok(byDate.rows.some((row) => row.id === sale.id));

console.log("5/7 Recherche par caissier et mode de paiement");
const byCashier = await search(admin, { p_search: sale.caissier, p_limit: 50 });
assert.ok(byCashier.rows.some((row) => row.id === sale.id));
const byPayment = await search(admin, { p_search: "Espèces", p_limit: 50 });
assert.ok(byPayment.rows.some((row) => row.id === sale.id));

console.log("6/7 Recherche client si une vente nominative existe");
const named = (await search(admin, { p_limit: 50 })).rows.find(
  (row) => row.client !== "Vente anonyme",
);
if (named) {
  const byClient = await search(admin, { p_search: named.client, p_limit: 50 });
  assert.ok(byClient.rows.some((row) => row.id === named.id));
}

console.log("7/7 Lectures et préparation de réimpression sans duplication");
const before = await search(admin, { p_search: sale.numero, p_limit: 25 });
assert.ifError((await admin.rpc("get_sale_receipt", { p_sale_id: sale.id })).error);
const after = await search(admin, { p_search: sale.numero, p_limit: 25 });
assert.equal(after.total, before.total);
assert.equal(after.rows.length, before.rows.length);
assert.equal(after.rows[0].id, before.rows[0].id);

console.log("Tous les tests d’intégration de l’historique des ventes sont réussis.");
