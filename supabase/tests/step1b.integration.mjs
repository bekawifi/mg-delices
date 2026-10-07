import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const required = [
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
  'TEST_ADMIN_EMAIL', 'TEST_ADMIN_PASSWORD',
  'TEST_CASHIER_EMAIL', 'TEST_CASHIER_PASSWORD',
  'TEST_INACTIVE_EMAIL', 'TEST_INACTIVE_PASSWORD',
]
for (const name of required) assert.ok(process.env[name], `Variable manquante : ${name}`)
assert.ok(!process.env.VITE_SUPABASE_URL.includes('votre-projet'), 'Configurez une instance Supabase de test réelle')

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const client = () => createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, options)
const signIn = async (email, password) => {
  const supabase = client()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  assert.ifError(error)
  assert.ok(data.user)
  return { supabase, user: data.user }
}
const expectDenied = (result, label) => assert.ok(result.error || !result.data?.length, `${label} devait être refusé`)
const uuid = () => crypto.randomUUID()

console.log('1/8 Connexion administrateur et droits catalogue')
const { supabase: admin, user: adminUser } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
const cashState = await admin.rpc('get_cash_session_summary', { p_session_id: null })
if (!cashState.error && !cashState.data) assert.ifError((await admin.rpc('open_cash_session', { p_fond_ouverture: 100000, p_idempotency_key: crypto.randomUUID() })).error)
const { data: adminProfile, error: adminProfileError } = await admin.from('profiles').select('*').eq('id', adminUser.id).single()
assert.ifError(adminProfileError)
assert.equal(adminProfile.role, 'admin')
assert.equal(adminProfile.is_active, true)

const { data: categories, error: categoryError } = await admin.from('categories').select('id,nom').eq('nom', 'Plats').limit(1)
assert.ifError(categoryError)
assert.equal(categories.length, 1, 'Exécutez supabase/seed.sql avant le test')
const temporaryName = `Produit sécurité ${Date.now()}`
const { data: temporaryProduct, error: adminInsertError } = await admin.from('produits').insert({
  categorie_id: categories[0].id, nom: temporaryName, prix_vente: 100, cout_estime: 50, disponible: false,
}).select('id').single()
assert.ifError(adminInsertError)
const adminUpdate = await admin.from('produits').update({ description: 'Test de droit administrateur' }).eq('id', temporaryProduct.id).select('id')
assert.ifError(adminUpdate.error)
assert.equal(adminUpdate.data.length, 1)
assert.ifError((await admin.from('produits').delete().eq('id', temporaryProduct.id)).error)

console.log('2/8 Préparation des produits et refus des écritures directes de vente')
const { data: products, error: productsError } = await admin.from('produits').select('id,nom,prix_vente').in('nom', ['Riz sauce', 'Eau'])
assert.ifError(productsError)
assert.equal(products.length, 2, 'Exécutez supabase/seed.sql avant le test')
const byName = Object.fromEntries(products.map(product => [product.nom, product]))
const directSale = await admin.from('ventes').insert({
  numero: `FORBIDDEN-${Date.now()}`, idempotency_key: uuid(), user_id: adminUser.id,
  type_commande: 'sur_place', sous_total: 1, remise: 0, total_final: 1, montant_recu: 1, monnaie_rendue: 0,
})
assert.ok(directSale.error, 'INSERT direct dans ventes devait être refusé')

console.log('3/8 Vente réelle, prix falsifié et contrôles métier')
const saleKey = uuid()
const saleArgs = {
  p_idempotency_key: saleKey, p_type_commande: 'sur_place', p_remise: 200,
  p_montant_recu: 5000, p_mode_paiement: 'especes',
  // prix_unitaire est volontairement falsifié. Le RPC doit l'ignorer.
  p_lignes: [
    { produit_id: byName['Riz sauce'].id, quantite: 2, prix_unitaire: 1 },
    { produit_id: byName.Eau.id, quantite: 2, prix_unitaire: 1 },
  ],
}
const first = await admin.rpc('create_sale', saleArgs)
assert.ifError(first.error)
assert.equal(first.data.total_final, 3800)
assert.equal(first.data.monnaie_rendue, 1200)
assert.equal(first.data.idempotent_replay, false)
assert.match(first.data.numero, /^MG-\d{8}-\d{4,}$/)

console.log('4/8 Idempotence : répétition exacte du même appel')
const replay = await admin.rpc('create_sale', saleArgs)
assert.ifError(replay.error)
assert.equal(replay.data.sale_id, first.data.sale_id)
assert.equal(replay.data.numero, first.data.numero)
assert.equal(replay.data.idempotent_replay, true)

const { data: sales, error: salesError } = await admin.from('ventes').select('*').eq('idempotency_key', saleKey)
assert.ifError(salesError)
assert.equal(sales.length, 1)
assert.equal(sales[0].user_id, adminUser.id)
assert.equal(Number(sales[0].sous_total), 4000)
assert.equal(Number(sales[0].total_final), 3800)
const { data: lines, error: linesError } = await admin.from('lignes_vente').select('*').eq('vente_id', first.data.sale_id)
assert.ifError(linesError)
assert.equal(lines.length, 2)
assert.deepEqual(Object.fromEntries(lines.map(line => [line.nom_produit, Number(line.prix_unitaire)])), { 'Riz sauce': 1500, Eau: 500 })
const { data: payments, error: paymentsError } = await admin.from('paiements').select('*').eq('vente_id', first.data.sale_id)
assert.ifError(paymentsError)
assert.equal(payments.length, 1)
assert.equal(payments[0].mode, 'especes')
assert.equal(Number(payments[0].montant), 3800)

console.log('5/8 Refus UPDATE/DELETE directs sur les données de vente')
assert.ok((await admin.from('ventes').update({ remise: 0 }).eq('id', first.data.sale_id)).error)
assert.ok((await admin.from('lignes_vente').delete().eq('vente_id', first.data.sale_id)).error)
assert.ok((await admin.from('paiements').update({ montant: 1 }).eq('vente_id', first.data.sale_id)).error)

console.log('6/8 Droits caissier')
const { supabase: cashier, user: cashierUser } = await signIn(process.env.TEST_CASHIER_EMAIL, process.env.TEST_CASHIER_PASSWORD)
const { data: cashierProfile, error: cashierProfileError } = await cashier.from('profiles').select('*').eq('id', cashierUser.id).single()
assert.ifError(cashierProfileError)
assert.equal(cashierProfile.role, 'caissier')
assert.equal((await cashier.from('produits').select('id').limit(1)).error, null)
assert.ok((await cashier.from('produits').insert({ nom: 'Interdit', prix_vente: 1, cout_estime: 0 })).error)
const cashierUpdate = await cashier.from('produits').update({ nom: 'Interdit' }).eq('id', byName.Eau.id).select('id')
expectDenied(cashierUpdate, 'UPDATE produit par un caissier')
const cashierSale = await cashier.rpc('create_sale', {
  p_idempotency_key: uuid(), p_type_commande: 'sur_place', p_remise: 0, p_montant_recu: 500,
  p_mode_paiement: 'especes', p_lignes: [{ produit_id: byName.Eau.id, quantite: 1 }],
})
assert.ifError(cashierSale.error)
assert.equal(cashierSale.data.total_final, 500)

console.log('7/8 Compte inactif')
const { supabase: inactive } = await signIn(process.env.TEST_INACTIVE_EMAIL, process.env.TEST_INACTIVE_PASSWORD)
const inactiveDashboard = await inactive.rpc('dashboard_stats')
assert.ok(inactiveDashboard.error, 'dashboard_stats devait refuser un compte inactif')
const inactiveSale = await inactive.rpc('create_sale', saleArgs)
assert.ok(inactiveSale.error, 'create_sale devait refuser un compte inactif')
const inactiveProducts = await inactive.from('produits').select('id')
assert.equal(inactiveProducts.data?.length || 0, 0)

console.log('8/8 Tableau de bord')
const dashboard = await admin.rpc('dashboard_stats')
assert.ifError(dashboard.error)
assert.ok(Number(dashboard.data.chiffre_affaires) >= 4300)
assert.ok(Number(dashboard.data.encaissements) >= 4300)
assert.ok(Number(dashboard.data.nombre_ventes) >= 2)
assert.ok(Number(dashboard.data.panier_moyen) > 0)
assert.ok(dashboard.data.dernieres_ventes.some(sale => sale.id === first.data.sale_id))

await Promise.all([admin.auth.signOut(), cashier.auth.signOut(), inactive.auth.signOut()])
console.log('Tous les tests Supabase Étape 1B sont réussis.')
